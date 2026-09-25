/**
 * SshAdapter — real host access over SSH (SPEC §4, §6 "SSH adapter").
 *
 * Usage
 * -----
 * 1. Settings → "Real hosts (SSH)" (or `PATCH /api/settings { ssh: {...} }`)
 *    stores an `SshAdapterConfig` + private key in `.data/secrets.json`:
 *    ```ts
 *    interface SshAdapterConfig {
 *      user: string;                 // e.g. "qalaa-agent"
 *      keyRef: string;               // secret id holding the private key (store.secrets.sshKeys[keyRef])
 *      port?: number;                // default 22
 *      bastion?: { host: string; user: string; keyRef: string; port?: number };
 *      hostKeyPolicy: "strict" | "accept-new";
 *      sudo?: boolean;               // wrap commands in sudo -n
 *      timeoutMs?: number;           // per-command timeout, default 15000
 *      hostMap?: Record<string, string>; // serverId -> reachable host[:port]
 *      orchestratorUrl?: string;     // migrate() posts here; unset → migrate refuses
 *    }
 *    ```
 * 2. `PATCH /api/fleet/servers/[id] { adapter: "ssh", sshTarget: "10.0.0.5:22" }`
 *    flips one server to this adapter and maps it to an address (→ `hostMap`).
 *    Every other server keeps using `SimAdapter`; `adapterFor(serverId)` picks.
 * 3. `POST /api/settings/ssh/test { serverId }` runs `echo qalaa-ok` and stores `settings.ssh.lastTest`.
 *
 * Behaviour
 * ---------
 * - Every op records the exact argv in `AdapterResult.command` and puts
 *   `{ argv, stdout, stderr, code, signal, durationMs }` in `evidence`.
 * - `sudo: true` → structured argv is prefixed `sudo -n --`; raw `exec` strings
 *   become `sudo -n sh -c '<cmd>'` so pipes/redirects keep working.
 * - Host keys: `strict` only connects to hosts pinned in `secrets.sshKnownHosts`
 *   (`host:port` → base64 key blob); `accept-new` pins on first contact. A
 *   changed key is always rejected (`ok:false`, "HOST KEY MISMATCH").
 * - Bastion: dial the jump host, `forwardOut` to the target, run the second
 *   handshake over that stream. Both hops honour the host-key policy.
 * - One connection per `host:port` is reused while ops are in flight and closed
 *   after `idleMs` (default 30 s) of inactivity.
 * - Connection / auth / host-key / timeout failures never throw: the op resolves
 *   `ok:false` with an actionable summary.
 * - `migrate` never shells out — it POSTs to `orchestratorUrl` or refuses.
 *
 * Host-side conventions
 * ---------------------
 * - `qalaa-agent` (optional binary): `apply-patch <id>`, `collect --quick --out <path>`,
 *   `rotate-secret <ref>`. When missing, `applyPatch` falls back to the package
 *   manager for `latest-known-cves` (`dnf -y --security upgrade`, or
 *   `apt-get -qq update && apt-get -y -qq upgrade` — apt has no security-only mode
 *   without unattended-upgrades, so the fallback upgrades every pending package),
 *   `snapshot` falls back to `tar` of /var/log + /etc, `rotateSecret` writes to
 *   the secret-manager agent socket (`/run/qalaa/secret-agent.sock`) via `socat`
 *   or fails honestly.
 * - `isolate` loads an atomic nftables ruleset (`nft -f -`) that replaces table
 *   `inet qalaa_isolate` with an output chain `policy drop` allowing only `lo`
 *   and replies on the sshd port (so this session survives), then flushes
 *   conntrack to kill established flows. `release` deletes the table.
 */
import type { Readable } from "node:stream";
import { Client, type ClientChannel, type ConnectConfig } from "ssh2";
import type { ID } from "@/lib/types";
import { store } from "../../store";
import type { AdapterResult, ServerAdapter } from "./types";
import { DEFAULT_SSH_PORT, DEFAULT_SSH_TIMEOUT_MS, sshConfig, sshKey, type SshAdapterConfig } from "./ssh-config";

export const SECRET_AGENT_SOCKET = "/run/qalaa/secret-agent.sock";
export const ISOLATE_TABLE = "qalaa_isolate";
export const DEFAULT_IDLE_MS = 30_000;

export type SshFailure = "config" | "connect" | "auth" | "hostkey" | "timeout" | "unreachable";

export class SshError extends Error {
  constructor(public readonly kind: SshFailure, message: string) {
    super(message);
    this.name = "SshError";
  }
}

export interface RunResult {
  code: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface KnownHostsStore {
  get(hostKey: string): string | undefined;
  set(hostKey: string, keyB64: string): void;
}

export interface SshAdapterDeps {
  config(): SshAdapterConfig | undefined;
  key(keyRef: string): string | undefined;
  /** reachable `host[:port]` for a server, or undefined when unmapped */
  target(serverId: ID): string | undefined;
  /** human label for summaries (hostname) */
  label(serverId: ID): string;
  knownHosts: KnownHostsStore;
  /** idle close for pooled connections */
  idleMs?: number;
  /** fetch used by `migrate` for the orchestrator hook */
  fetch?: typeof fetch;
}

/** Default deps: everything comes from `store` (secrets + servers). */
export const storeDeps: SshAdapterDeps = {
  config: () => sshConfig(),
  key: (ref) => sshKey(ref),
  target: (serverId) => sshConfig()?.hostMap?.[serverId] ?? store.server(serverId)?.sshTarget,
  label: (serverId) => store.server(serverId)?.hostname ?? serverId,
  knownHosts: {
    get: (k) => store.secrets.sshKnownHosts?.[k],
    set: (k, v) => {
      (store.secrets.sshKnownHosts ??= {})[k] = v;
      store.saveSecrets();
    },
  },
};

/* ───────────────────────── command construction ───────────────────────── */

/** POSIX single-quote shell escaping. */
export function shq(arg: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** argv → command line, prefixed with `sudo -n --` when requested. */
export function buildCommand(argv: string[], sudo: boolean): { argv: string[]; command: string } {
  const full = sudo ? ["sudo", "-n", "--", ...argv] : argv;
  return { argv: full, command: full.map(shq).join(" ") };
}

/** Raw shell string (agent-authored) → optionally `sudo -n sh -c '<cmd>'`. */
export function wrapShell(cmd: string, sudo: boolean): { argv: string[]; command: string } {
  if (!sudo) return { argv: ["sh", "-c", cmd], command: cmd };
  const argv = ["sudo", "-n", "sh", "-c", cmd];
  return { argv, command: argv.map(shq).join(" ") };
}

export function isolateRuleset(sshPort: number): string {
  return [
    `table inet ${ISOLATE_TABLE}`,
    `delete table inet ${ISOLATE_TABLE}`,
    `table inet ${ISOLATE_TABLE} {`,
    `  chain egress {`,
    `    type filter hook output priority 0; policy drop;`,
    `    oifname "lo" accept`,
    `    tcp sport ${sshPort} accept`,
    `  }`,
    `}`,
    ``,
  ].join("\n");
}

export function parseTarget(target: string, defaultPort: number): { host: string; port: number } {
  const m = /^\[?([^\]]+?)\]?(?::(\d+))?$/.exec(target.trim());
  if (!m) return { host: target.trim(), port: defaultPort };
  const port = m[2] ? Number(m[2]) : defaultPort;
  return { host: m[1], port: Number.isFinite(port) && port > 0 ? port : defaultPort };
}

/* ───────────────────────── connection pool ───────────────────────── */

interface Conn {
  client: Client;
  bastion?: Client;
  inflight: number;
  idle: ReturnType<typeof setTimeout> | null;
}

interface Target {
  serverId: ID;
  label: string;
  host: string;
  port: number;
  cfg: SshAdapterConfig;
  timeoutMs: number;
  sudo: boolean;
}

function classify(err: unknown, where: string, hostKeyReason?: string): SshError {
  if (err instanceof SshError) return err;
  const e = err as { message?: string; level?: string; code?: string };
  const msg = e?.message ?? String(err);
  if (hostKeyReason) return new SshError("hostkey", hostKeyReason);
  if (e?.level === "client-authentication" || /authentication/i.test(msg)) {
    return new SshError("auth", `${where}: authentication failed — check the login user and that the stored private key's public half is in authorized_keys (${msg})`);
  }
  if (e?.level === "client-timeout" || /timed out/i.test(msg) || e?.code === "ETIMEDOUT") {
    return new SshError("timeout", `${where}: connection timed out (${msg})`);
  }
  if (e?.code === "ECONNREFUSED") return new SshError("connect", `${where}: connection refused — is sshd listening on that port? (${msg})`);
  if (e?.code === "ENOTFOUND" || e?.code === "EAI_AGAIN") return new SshError("connect", `${where}: host not found — check the sshTarget / hostMap address (${msg})`);
  return new SshError("connect", `${where}: ${msg}`);
}

export class SshAdapter implements ServerAdapter {
  readonly kind = "ssh" as const;
  private conns = new Map<string, Promise<Conn>>();

  constructor(private readonly deps: SshAdapterDeps = storeDeps) {}

  /* ── resolution ── */

  private resolve(serverId: ID): Target {
    const cfg = this.deps.config();
    if (!cfg || !cfg.user) {
      throw new SshError("config", "ssh adapter not configured — set user + private key in Settings → Real hosts (SSH)");
    }
    const raw = this.deps.target(serverId);
    if (!raw) {
      throw new SshError("unreachable", `no reachable address for ${serverId} — PATCH /api/fleet/servers/${serverId} { sshTarget: "host[:port]" }`);
    }
    const { host, port } = parseTarget(raw, cfg.port ?? DEFAULT_SSH_PORT);
    return {
      serverId,
      label: this.deps.label(serverId),
      host,
      port,
      cfg,
      timeoutMs: cfg.timeoutMs ?? DEFAULT_SSH_TIMEOUT_MS,
      sudo: !!cfg.sudo,
    };
  }

  /* ── host keys ── */

  private verifyHostKey(id: string, policy: SshAdapterConfig["hostKeyPolicy"], key: Buffer): { ok: true } | { ok: false; reason: string } {
    const seen = key.toString("base64");
    const pinned = this.deps.knownHosts.get(id);
    if (pinned) {
      if (pinned === seen) return { ok: true };
      return {
        ok: false,
        reason: `HOST KEY MISMATCH for ${id} — the host key changed since it was pinned; refusing to connect. If the host was legitimately re-keyed, forget known hosts in Settings → Real hosts (SSH) and reconnect.`,
      };
    }
    if (policy === "strict") {
      return { ok: false, reason: `host key for ${id} is not pinned and hostKeyPolicy is strict — connect once with accept-new to pin it` };
    }
    this.deps.knownHosts.set(id, seen);
    return { ok: true };
  }

  /* ── dialing ── */

  private dial(cfg: ConnectConfig, where: string, hostKeyId: string, policy: SshAdapterConfig["hostKeyPolicy"]): Promise<Client> {
    return new Promise<Client>((resolve, reject) => {
      const client = new Client();
      let hostKeyReason: string | undefined;
      let ready = false;
      client.once("ready", () => {
        ready = true;
        resolve(client);
      });
      // permanent listener: a late error must never become an unhandled 'error' event
      client.on("error", (err: Error) => {
        if (ready) return;
        client.end();
        reject(classify(err, where, hostKeyReason));
      });
      client.connect({
        ...cfg,
        hostVerifier: (key: Buffer) => {
          const v = this.verifyHostKey(hostKeyId, policy, key);
          if (!v.ok) hostKeyReason = v.reason;
          return v.ok;
        },
      });
    });
  }

  private forward(bastion: Client, host: string, port: number): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      bastion.forwardOut("127.0.0.1", 0, host, port, (err, stream) => {
        if (err) reject(new SshError("connect", `bastion could not reach ${host}:${port} — ${err.message}`));
        else resolve(stream);
      });
    });
  }

  private async open(t: Target): Promise<Conn> {
    const key = this.deps.key(t.cfg.keyRef);
    if (!key) throw new SshError("config", `no private key stored for keyRef "${t.cfg.keyRef}" — paste one in Settings → Real hosts (SSH)`);
    let bastion: Client | undefined;
    let sock: Readable | undefined;
    if (t.cfg.bastion) {
      const b = t.cfg.bastion;
      const bPort = b.port ?? DEFAULT_SSH_PORT;
      bastion = await this.dial(
        { host: b.host, port: bPort, username: b.user, privateKey: this.deps.key(b.keyRef) ?? key, readyTimeout: t.timeoutMs },
        `bastion ${b.host}:${bPort}`,
        `${b.host}:${bPort}`,
        t.cfg.hostKeyPolicy
      );
      try {
        sock = await this.forward(bastion, t.host, t.port);
      } catch (err) {
        bastion.end();
        throw err;
      }
    }
    let client: Client;
    try {
      client = await this.dial(
        { host: t.host, port: t.port, username: t.cfg.user, privateKey: key, readyTimeout: t.timeoutMs, ...(sock ? { sock } : {}) },
        `${t.label} (${t.host}:${t.port})`,
        `${t.host}:${t.port}`,
        t.cfg.hostKeyPolicy
      );
    } catch (err) {
      bastion?.end();
      throw err;
    }
    const conn: Conn = { client, bastion, inflight: 0, idle: null };
    const drop = () => {
      if (conn.idle) clearTimeout(conn.idle);
      this.conns.delete(this.poolKey(t));
      bastion?.end();
    };
    client.on("close", drop);
    client.on("error", drop);
    return conn;
  }

  private poolKey(t: Target): string {
    return `${t.cfg.user}@${t.host}:${t.port}${t.cfg.bastion ? ` via ${t.cfg.bastion.host}` : ""}`;
  }

  private async acquire(t: Target): Promise<Conn> {
    const k = this.poolKey(t);
    let p = this.conns.get(k);
    if (!p) {
      p = this.open(t);
      this.conns.set(k, p);
      p.catch(() => this.conns.delete(k));
    }
    const conn = await p;
    if (conn.idle) {
      clearTimeout(conn.idle);
      conn.idle = null;
    }
    conn.inflight++;
    return conn;
  }

  private releaseConn(t: Target, conn: Conn): void {
    conn.inflight--;
    if (conn.inflight > 0) return;
    const idleMs = this.deps.idleMs ?? DEFAULT_IDLE_MS;
    conn.idle = setTimeout(() => {
      this.conns.delete(this.poolKey(t));
      conn.client.end();
      conn.bastion?.end();
    }, idleMs);
    if (typeof conn.idle === "object" && "unref" in conn.idle) (conn.idle as { unref: () => void }).unref();
  }

  /** Close every pooled connection (tests / shutdown). */
  async closeAll(): Promise<void> {
    const all = [...this.conns.values()];
    this.conns.clear();
    for (const p of all) {
      try {
        const c = await p;
        if (c.idle) clearTimeout(c.idle);
        c.client.end();
        c.bastion?.end();
      } catch {
        /* already failed */
      }
    }
  }

  /* ── running ── */

  private run(conn: Conn, command: string, timeoutMs: number, stdin?: string): Promise<RunResult> {
    return new Promise<RunResult>((resolve, reject) => {
      const started = Date.now();
      let stdout = "";
      let stderr = "";
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (r: Omit<RunResult, "durationMs">) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        resolve({ ...r, durationMs: Date.now() - started });
      };
      conn.client.exec(command, (err, stream) => {
        if (err) {
          done = true;
          reject(new SshError("connect", `exec channel failed: ${err.message}`));
          return;
        }
        timer = setTimeout(() => {
          try {
            stream.close();
          } catch {
            /* channel already gone */
          }
          finish({ code: null, stdout, stderr, timedOut: true });
        }, timeoutMs);
        stream.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        stream.stderr.on("data", (d: Buffer) => {
          stderr += d.toString();
        });
        stream.on("close", (code: number | null, signal?: string) => finish({ code, signal: signal ?? undefined, stdout, stderr, timedOut: false }));
        if (stdin !== undefined) stream.end(stdin);
      });
    });
  }

  /** Resolve → connect → run; every failure becomes an `ok:false` result. */
  private async withHost(
    serverId: ID,
    fallbackCommand: string,
    fn: (t: Target, exec: (command: string, stdin?: string) => Promise<RunResult>) => Promise<AdapterResult>
  ): Promise<AdapterResult> {
    let t: Target;
    try {
      t = this.resolve(serverId);
    } catch (err) {
      const e = err as SshError;
      return { ok: false, summary: e.message, command: fallbackCommand, evidence: { failure: e.kind } };
    }
    let conn: Conn | undefined;
    try {
      conn = await this.acquire(t);
      const exec = (command: string, stdin?: string) => this.run(conn!, command, t.timeoutMs, stdin);
      return await fn(t, exec);
    } catch (err) {
      const e = classify(err, `${t.label} (${t.host}:${t.port})`);
      return { ok: false, summary: e.message, command: fallbackCommand, evidence: { failure: e.kind, host: t.host, port: t.port } };
    } finally {
      if (conn) this.releaseConn(t, conn);
    }
  }

  private evidence(argv: string[], r: RunResult, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      argv,
      stdout: r.stdout.slice(-4000),
      stderr: r.stderr.slice(-4000),
      code: r.code,
      signal: r.signal,
      timedOut: r.timedOut,
      durationMs: r.durationMs,
      ...extra,
    };
  }

  private outcome(t: Target, what: string, built: { argv: string[]; command: string }, r: RunResult, extra: Record<string, unknown> = {}): AdapterResult {
    const ev = this.evidence(built.argv, r, extra);
    if (r.timedOut) {
      return { ok: false, summary: `${what} on ${t.label} timed out after ${t.timeoutMs} ms`, command: built.command, evidence: ev };
    }
    if (r.code !== 0) {
      const tail = (r.stderr || r.stdout).trim().split("\n").pop() ?? "";
      const hint = tail ? tail.slice(0, 160) : t.sudo ? "no output" : "no output; if the command needs root, enable sudo in settings.ssh";
      return { ok: false, summary: `${what} on ${t.label} exited ${r.code ?? r.signal ?? "?"} — ${hint}`, command: built.command, evidence: ev };
    }
    return { ok: true, summary: `${what} on ${t.label}`, command: built.command, evidence: ev };
  }

  private async hasAgent(exec: (c: string) => Promise<RunResult>): Promise<boolean> {
    const r = await exec("command -v qalaa-agent >/dev/null 2>&1");
    return r.code === 0;
  }

  /* ── operations ── */

  async exec(serverId: ID, cmd: string): Promise<AdapterResult> {
    return this.withHost(serverId, cmd, async (t, exec) => {
      const built = wrapShell(cmd, t.sudo);
      const r = await exec(built.command);
      return this.outcome(t, `ran \`${cmd}\``, built, r);
    });
  }

  async readConfig(serverId: ID, path: string): Promise<AdapterResult> {
    const fallback = buildCommand(["cat", path], false).command;
    return this.withHost(serverId, fallback, async (t, exec) => {
      const built = buildCommand(["cat", path], t.sudo);
      const r = await exec(built.command);
      const res = this.outcome(t, `read ${path}`, built, r, { path });
      if (res.ok) res.evidence = { ...res.evidence, content: r.stdout.slice(0, 16_000) };
      return res;
    });
  }

  async applyPatch(serverId: ID, patchId: string): Promise<AdapterResult> {
    const agentCmd = ["qalaa-agent", "apply-patch", patchId];
    return this.withHost(serverId, buildCommand(agentCmd, false).command, async (t, exec) => {
      if (await this.hasAgent(exec)) {
        const built = buildCommand(agentCmd, t.sudo);
        const r = await exec(built.command);
        return this.outcome(t, `applied ${patchId}`, built, r, { via: "qalaa-agent" });
      }
      if (patchId !== "latest-known-cves") {
        return {
          ok: false,
          summary: `qalaa-agent not installed on ${t.label} and patch "${patchId}" has no package-manager fallback (only latest-known-cves does)`,
          command: buildCommand(agentCmd, t.sudo).command,
          evidence: { via: "none", patchId },
        };
      }
      const pm = await exec("command -v dnf >/dev/null 2>&1 && echo dnf || (command -v apt-get >/dev/null 2>&1 && echo apt || echo none)");
      const which = pm.stdout.trim();
      if (which === "dnf") {
        const built = buildCommand(["dnf", "-y", "--security", "upgrade"], t.sudo);
        const r = await exec(built.command);
        return this.outcome(t, "applied security updates (dnf)", built, r, { via: "dnf", patchId });
      }
      if (which === "apt") {
        const script = "apt-get -qq update && DEBIAN_FRONTEND=noninteractive apt-get -y -qq upgrade";
        const built = wrapShell(script, t.sudo);
        const r = await exec(built.command);
        return this.outcome(t, "applied pending updates (apt)", built, r, { via: "apt", patchId, note: "apt has no security-only mode without unattended-upgrades; all pending upgrades applied" });
      }
      return {
        ok: false,
        summary: `no qalaa-agent, dnf or apt-get on ${t.label} — cannot apply ${patchId}`,
        command: buildCommand(agentCmd, t.sudo).command,
        evidence: { via: "none", patchId, probe: pm.stdout.trim() },
      };
    });
  }

  async isolate(serverId: ID): Promise<AdapterResult> {
    const fallback = buildCommand(["nft", "-f", "-"], false).command;
    return this.withHost(serverId, fallback, async (t, exec) => {
      const ruleset = isolateRuleset(t.port);
      const built = buildCommand(["nft", "-f", "-"], t.sudo);
      const r = await exec(built.command, ruleset);
      const res = this.outcome(t, "isolate (nftables egress deny)", built, r, { ruleset, table: ISOLATE_TABLE });
      if (!res.ok) return res;
      const ct = buildCommand(["conntrack", "-F"], t.sudo);
      const cr = await exec(`command -v conntrack >/dev/null 2>&1 && ${ct.command} || echo "conntrack not installed" >&2`);
      res.evidence = { ...res.evidence, conntrack: { argv: ct.argv, code: cr.code, stderr: cr.stderr.slice(-400) } };
      res.summary = `${t.label} isolated — egress denied except lo and sshd:${t.port}${cr.stderr.includes("not installed") ? " (conntrack missing: existing flows die on next packet)" : ", established flows dropped"}`;
      return res;
    });
  }

  async release(serverId: ID): Promise<AdapterResult> {
    const argv = ["nft", "delete", "table", "inet", ISOLATE_TABLE];
    return this.withHost(serverId, buildCommand(argv, false).command, async (t, exec) => {
      const built = buildCommand(argv, t.sudo);
      const r = await exec(built.command);
      if (r.code !== 0 && !r.timedOut && /No such file or directory/i.test(r.stderr)) {
        return { ok: true, summary: `${t.label} was not isolated (no ${ISOLATE_TABLE} table)`, command: built.command, evidence: this.evidence(built.argv, r, { alreadyReleased: true }) };
      }
      const res = this.outcome(t, "released (nftables table deleted)", built, r);
      if (res.ok) res.summary = `${t.label} released — ${ISOLATE_TABLE} table deleted`;
      return res;
    });
  }

  async rotateSecret(serverId: ID, secretRef: string): Promise<AdapterResult> {
    const agentCmd = ["qalaa-agent", "rotate-secret", secretRef];
    return this.withHost(serverId, buildCommand(agentCmd, false).command, async (t, exec) => {
      if (await this.hasAgent(exec)) {
        const built = buildCommand(agentCmd, t.sudo);
        const r = await exec(built.command);
        return this.outcome(t, `rotated ${secretRef}`, built, r, { via: "qalaa-agent" });
      }
      const probe = await exec(`test -S ${shq(SECRET_AGENT_SOCKET)} && command -v socat >/dev/null 2>&1`);
      if (probe.code !== 0) {
        return {
          ok: false,
          summary: `no secret-manager agent on ${t.label} (${SECRET_AGENT_SOCKET} missing or socat unavailable) — ${secretRef} was NOT rotated`,
          command: buildCommand(agentCmd, t.sudo).command,
          evidence: { via: "none", socket: SECRET_AGENT_SOCKET, secretRef },
        };
      }
      const req = JSON.stringify({ op: "rotate", ref: secretRef, by: "qalaa" });
      const built = buildCommand(["socat", "-t5", "-", `UNIX-CONNECT:${SECRET_AGENT_SOCKET}`], t.sudo);
      const r = await exec(built.command, `${req}\n`);
      return this.outcome(t, `rotated ${secretRef} via secret-manager socket`, built, r, { via: "socket", socket: SECRET_AGENT_SOCKET, request: req });
    });
  }

  async snapshot(serverId: ID): Promise<AdapterResult> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `/tmp/qalaa-snapshot-${serverId}-${stamp}.tgz`;
    const agentCmd = ["qalaa-agent", "collect", "--quick", "--out", path];
    return this.withHost(serverId, buildCommand(agentCmd, false).command, async (t, exec) => {
      if (await this.hasAgent(exec)) {
        const built = buildCommand(agentCmd, t.sudo);
        const r = await exec(built.command);
        const res = this.outcome(t, `snapshot collected`, built, r, { via: "qalaa-agent", path });
        if (res.ok) res.summary = `snapshot of ${t.label} written to ${path}`;
        return res;
      }
      const argv = ["tar", "--ignore-failed-read", "--warning=no-file-changed", "-czf", path, "/var/log", "/etc"];
      const built = buildCommand(argv, t.sudo);
      const r = await exec(built.command);
      // tar exits 1 when a file changed while reading — the archive is still usable
      const soft = r.code === 1 && !r.timedOut;
      const res = this.outcome(t, "snapshot (tar fallback)", built, soft ? { ...r, code: 0 } : r, { via: "tar", path, tarExit: r.code });
      if (res.ok) res.summary = `snapshot of ${t.label} (tar of /var/log + /etc) written to ${path}${soft ? " (some files changed while reading)" : ""}`;
      return res;
    });
  }

  async migrate(sourceId: ID, targetId: ID | undefined, workloads: string[]): Promise<AdapterResult> {
    const cfg = this.deps.config();
    const url = cfg?.orchestratorUrl;
    const body = { action: "migrate", sourceId, targetId, workloads };
    if (!url) {
      return {
        ok: false,
        summary: "migration requires orchestrator API — set settings.ssh.orchestratorUrl; the ssh adapter never drains workloads over raw ssh",
        command: `migrate ${sourceId} ${workloads.join(",")}`,
        evidence: { failure: "config", body },
      };
    }
    const command = `POST ${url} ${JSON.stringify(body)}`;
    const timeoutMs = cfg?.timeoutMs ?? DEFAULT_SSH_TIMEOUT_MS;
    const doFetch = this.deps.fetch ?? fetch;
    const started = Date.now();
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = (await res.text()).slice(0, 4000);
      if (!res.ok) {
        return { ok: false, summary: `orchestrator rejected migration of ${sourceId}: HTTP ${res.status}`, command, evidence: { status: res.status, body: text, durationMs: Date.now() - started } };
      }
      return { ok: true, summary: `orchestrator accepted migration of ${workloads.length} workload(s) off ${this.deps.label(sourceId)}`, command, evidence: { status: res.status, body: text, durationMs: Date.now() - started } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, summary: `orchestrator unreachable at ${url}: ${msg}`, command, evidence: { failure: "connect", durationMs: Date.now() - started } };
    }
  }
}
