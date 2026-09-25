/**
 * SshAdapter unit tests — ssh2 is mocked, so every op is checked for the
 * exact command line it would run plus the failure semantics (timeouts,
 * host-key policy, unconfigured / unmapped hosts) without touching a socket.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* ───────────────────────── ssh2 mock (hoisted above the vi.mock factory) ───────────────────────── */

interface Reply {
  code?: number;
  stdout?: string;
  stderr?: string;
  /** never emit close (used to force a timeout) */
  hang?: boolean;
}
type Responder = (command: string, stdin: string | undefined) => Reply;

const { mock, MockClient, MockStream, HOST_KEY } = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  const HOST_KEY = Buffer.from("ssh-ed25519 AAAA-test-host-key");

  class MockStream extends EventEmitter {
    stderr = new EventEmitter();
    stdin?: string;
    closed = false;
    end(data?: string) {
      this.stdin = data;
    }
    close() {
      this.closed = true;
    }
  }

  const mock = {
    clients: [] as MockClient[],
    execs: [] as { command: string; stdin?: string }[],
    hostKey: HOST_KEY,
    responder: ((): Reply => ({ code: 0, stdout: "" })) as Responder,
    connectError: undefined as (Error & { level?: string; code?: string }) | undefined,
  };

  class MockClient extends EventEmitter {
    cfg: Record<string, unknown> = {};
    ended = false;
    forwards: { host: string; port: number }[] = [];
    constructor() {
      super();
      mock.clients.push(this);
    }
    connect(cfg: Record<string, unknown> & { hostVerifier?: (key: Buffer) => boolean }) {
      this.cfg = cfg;
      queueMicrotask(() => {
        if (mock.connectError) {
          this.emit("error", mock.connectError);
          return;
        }
        if (cfg.hostVerifier && !cfg.hostVerifier(mock.hostKey)) {
          this.emit("error", Object.assign(new Error("Host verification failed"), { level: "client-hostkey" }));
          return;
        }
        this.emit("ready");
      });
    }
    exec(command: string, cb: (err: Error | undefined, stream: MockStream) => void) {
      const stream = new MockStream();
      cb(undefined, stream);
      setTimeout(() => {
        const reply = mock.responder(command, stream.stdin);
        mock.execs.push({ command, stdin: stream.stdin });
        if (reply.hang) return;
        if (reply.stdout) stream.emit("data", Buffer.from(reply.stdout));
        if (reply.stderr) stream.stderr.emit("data", Buffer.from(reply.stderr));
        stream.emit("close", reply.code ?? 0, undefined);
      }, 0);
    }
    forwardOut(_sh: string, _sp: number, host: string, port: number, cb: (err: Error | undefined, stream: MockStream) => void) {
      this.forwards.push({ host, port });
      cb(undefined, new MockStream());
    }
    end() {
      this.ended = true;
      this.emit("close");
    }
  }

  return { mock, MockClient, MockStream, HOST_KEY };
});

vi.mock("ssh2", () => ({ Client: MockClient }));

/* ───────────────────────── adapter under test ───────────────────────── */

import { SshAdapter, ISOLATE_TABLE, SECRET_AGENT_SOCKET, isolateRuleset, shq, type SshAdapterDeps } from "@/server/fleet/adapters/ssh";
import type { SshAdapterConfig } from "@/server/fleet/adapters/ssh-config";

const SRV = "srv-dataset-worker-01";

function makeDeps(over: Partial<SshAdapterConfig> = {}, extra: Partial<SshAdapterDeps> = {}) {
  const known = new Map<string, string>();
  const cfg: SshAdapterConfig = { user: "qalaa-agent", keyRef: "k", hostKeyPolicy: "accept-new", timeoutMs: 200, ...over };
  const deps: SshAdapterDeps = {
    config: () => cfg,
    key: (ref) => (ref === "k" || ref === "kb" ? `PRIVATE-${ref}` : undefined),
    target: (id) => (id === SRV ? "10.0.0.5:2222" : undefined),
    label: (id) => (id === SRV ? "dataset-worker-01" : id),
    knownHosts: { get: (k) => known.get(k), set: (k, v) => void known.set(k, v) },
    idleMs: 50,
    ...extra,
  };
  return { deps, known, cfg };
}

/** commands the ops actually ran, excluding the `command -v` probes */
const ran = () => mock.execs.map((e) => e.command).filter((c) => !c.startsWith("command -v"));

let adapter: SshAdapter | undefined;

beforeEach(() => {
  mock.clients = [];
  mock.execs = [];
  mock.hostKey = HOST_KEY;
  mock.connectError = undefined;
  mock.responder = () => ({ code: 0, stdout: "" });
});

afterEach(async () => {
  await adapter?.closeAll();
  adapter = undefined;
});

describe("command construction", () => {
  it("exec runs the raw command and records argv + stdout/stderr/code", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    mock.responder = () => ({ code: 0, stdout: "qalaa-ok\n" });
    const r = await adapter.exec(SRV, "echo qalaa-ok");
    expect(r.ok).toBe(true);
    expect(r.command).toBe("echo qalaa-ok");
    expect(r.evidence).toMatchObject({ argv: ["sh", "-c", "echo qalaa-ok"], stdout: "qalaa-ok\n", stderr: "", code: 0, timedOut: false });
    expect(mock.clients[0].cfg).toMatchObject({ host: "10.0.0.5", port: 2222, username: "qalaa-agent", privateKey: "PRIVATE-k" });
  });

  it("exec wraps in sudo -n sh -c when sudo is on", async () => {
    adapter = new SshAdapter(makeDeps({ sudo: true }).deps);
    const r = await adapter.exec(SRV, "systemctl restart nginx");
    expect(r.command).toBe("sudo -n sh -c 'systemctl restart nginx'");
    expect(ran()).toEqual(["sudo -n sh -c 'systemctl restart nginx'"]);
  });

  it("non-zero exit → ok:false with the stderr tail in the summary", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    mock.responder = () => ({ code: 2, stderr: "boom: permission denied\n" });
    const r = await adapter.exec(SRV, "false");
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("exited 2");
    expect(r.summary).toContain("permission denied");
    expect(r.evidence).toMatchObject({ code: 2, stderr: "boom: permission denied\n" });
  });

  it("readConfig → cat <path> (sudo-wrapped) with the content in evidence", async () => {
    adapter = new SshAdapter(makeDeps({ sudo: true }).deps);
    mock.responder = () => ({ code: 0, stdout: "PermitRootLogin no\n" });
    const r = await adapter.readConfig(SRV, "/etc/ssh/sshd_config");
    expect(r.command).toBe("sudo -n -- cat /etc/ssh/sshd_config");
    expect(r.evidence).toMatchObject({ argv: ["sudo", "-n", "--", "cat", "/etc/ssh/sshd_config"], content: "PermitRootLogin no\n" });
    // paths with spaces are quoted
    const r2 = await adapter.readConfig(SRV, "/etc/my app/x.conf");
    expect(r2.command).toBe("sudo -n -- cat '/etc/my app/x.conf'");
  });

  it("applyPatch prefers qalaa-agent when installed", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    mock.responder = () => ({ code: 0 });
    const r = await adapter.applyPatch(SRV, "latest-known-cves");
    expect(r.ok).toBe(true);
    expect(r.command).toBe("qalaa-agent apply-patch latest-known-cves");
    expect(r.evidence).toMatchObject({ via: "qalaa-agent" });
  });

  it("applyPatch falls back to dnf --security / apt-get for latest-known-cves", async () => {
    adapter = new SshAdapter(makeDeps({ sudo: true }).deps);
    mock.responder = (c) => (c.startsWith("command -v qalaa-agent") ? { code: 1 } : c.startsWith("command -v dnf") ? { code: 0, stdout: "dnf\n" } : { code: 0 });
    const r = await adapter.applyPatch(SRV, "latest-known-cves");
    expect(r.ok).toBe(true);
    expect(r.command).toBe("sudo -n -- dnf -y --security upgrade");
    expect(r.evidence).toMatchObject({ via: "dnf" });

    mock.execs = [];
    mock.responder = (c) => (c.startsWith("command -v qalaa-agent") ? { code: 1 } : c.startsWith("command -v dnf") ? { code: 0, stdout: "apt\n" } : { code: 0 });
    const r2 = await adapter.applyPatch(SRV, "latest-known-cves");
    expect(r2.ok).toBe(true);
    expect(r2.command).toBe("sudo -n sh -c 'apt-get -qq update && DEBIAN_FRONTEND=noninteractive apt-get -y -qq upgrade'");
    expect(r2.evidence).toMatchObject({ via: "apt" });
  });

  it("applyPatch refuses unknown patch ids without the agent", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    mock.responder = () => ({ code: 1 });
    const r = await adapter.applyPatch(SRV, "CVE-2026-0001");
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/no package-manager fallback/);
    expect(ran()).toEqual([]);
  });

  it("isolate feeds an idempotent nftables ruleset to `nft -f -` then flushes conntrack", async () => {
    adapter = new SshAdapter(makeDeps({ sudo: true }).deps);
    mock.responder = () => ({ code: 0 });
    const r = await adapter.isolate(SRV);
    expect(r.ok).toBe(true);
    expect(r.command).toBe("sudo -n -- nft -f -");
    const nft = mock.execs.find((e) => e.command === "sudo -n -- nft -f -")!;
    expect(nft.stdin).toBe(isolateRuleset(2222));
    expect(nft.stdin).toContain(`delete table inet ${ISOLATE_TABLE}`);
    expect(nft.stdin).toContain("policy drop");
    expect(nft.stdin).toContain("tcp sport 2222 accept");
    expect(mock.execs.some((e) => e.command.includes("sudo -n -- conntrack -F"))).toBe(true);
    expect(r.summary).toContain("established flows dropped");
  });

  it("isolate is honest when nft is missing", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    mock.responder = () => ({ code: 127, stderr: "sh: 1: nft: not found\n" });
    const r = await adapter.isolate(SRV);
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("exited 127");
    expect(r.evidence).toMatchObject({ code: 127, table: ISOLATE_TABLE });
  });

  it("release deletes the table and treats a missing table as already released", async () => {
    adapter = new SshAdapter(makeDeps({ sudo: true }).deps);
    mock.responder = () => ({ code: 0 });
    const r = await adapter.release(SRV);
    expect(r.ok).toBe(true);
    expect(r.command).toBe(`sudo -n -- nft delete table inet ${ISOLATE_TABLE}`);

    mock.responder = () => ({ code: 1, stderr: "Error: No such file or directory\ndelete table inet qalaa_isolate\n" });
    const r2 = await adapter.release(SRV);
    expect(r2.ok).toBe(true);
    expect(r2.evidence).toMatchObject({ alreadyReleased: true });
  });

  it("rotateSecret never fakes success without an agent or socket", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    mock.responder = () => ({ code: 1 });
    const r = await adapter.rotateSecret(SRV, "db/main");
    expect(r.ok).toBe(false);
    expect(r.summary).toContain(SECRET_AGENT_SOCKET);
    expect(r.summary).toContain("NOT rotated");
    expect(r.command).toBe("qalaa-agent rotate-secret db/main");
  });

  it("rotateSecret writes a JSON request to the secret-manager socket when present", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    mock.responder = (c) => (c.startsWith("command -v qalaa-agent") ? { code: 1 } : { code: 0, stdout: "{\"ok\":true}" });
    const r = await adapter.rotateSecret(SRV, "db/main");
    expect(r.ok).toBe(true);
    expect(r.command).toBe(`socat -t5 - UNIX-CONNECT:${SECRET_AGENT_SOCKET}`);
    const sock = mock.execs.find((e) => e.command.startsWith("socat"))!;
    expect(JSON.parse(sock.stdin!.trim())).toEqual({ op: "rotate", ref: "db/main", by: "qalaa" });
  });

  it("snapshot uses qalaa-agent collect --quick, else tars /var/log + /etc and reports the path", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    mock.responder = () => ({ code: 0 });
    const r = await adapter.snapshot(SRV);
    expect(r.ok).toBe(true);
    expect(r.command).toMatch(new RegExp(`^qalaa-agent collect --quick --out /tmp/qalaa-snapshot-${SRV}-`));
    expect(r.summary).toContain("/tmp/qalaa-snapshot-");

    mock.responder = (c) => (c.startsWith("command -v qalaa-agent") ? { code: 1 } : { code: 1, stderr: "tar: file changed as we read it\n" });
    const r2 = await adapter.snapshot(SRV);
    expect(r2.ok).toBe(true);
    expect(r2.command).toMatch(/^tar --ignore-failed-read --warning=no-file-changed -czf \/tmp\/qalaa-snapshot-.* \/var\/log \/etc$/);
    expect(r2.evidence).toMatchObject({ via: "tar", tarExit: 1 });
    expect(r2.summary).toContain("some files changed while reading");
  });

  it("migrate never shells out and refuses without an orchestrator hook", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    const r = await adapter.migrate(SRV, "srv-dataset-worker-02", ["scraper"]);
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/^migration requires orchestrator API/);
    expect(mock.clients).toHaveLength(0);
    expect(mock.execs).toHaveLength(0);
  });

  it("migrate POSTs to the orchestrator when configured", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response("accepted", { status: 202 });
    }) as typeof fetch;
    adapter = new SshAdapter(makeDeps({ orchestratorUrl: "http://orch.local/api" }, { fetch: fakeFetch }).deps);
    const r = await adapter.migrate(SRV, undefined, ["scraper", "indexer"]);
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ url: "http://orch.local/api", body: { action: "migrate", sourceId: SRV, targetId: undefined, workloads: ["scraper", "indexer"] } }]);
    expect(r.command).toMatch(/^POST http:\/\/orch\.local\/api /);
    expect(mock.clients).toHaveLength(0);
  });

  it("shq quotes only when needed", () => {
    expect(shq("/etc/passwd")).toBe("/etc/passwd");
    expect(shq("it's here")).toBe(`'it'\\''s here'`);
  });
});

describe("failure semantics", () => {
  it("timeout → ok:false, channel closed, never throws", async () => {
    adapter = new SshAdapter(makeDeps({ timeoutMs: 30 }).deps);
    mock.responder = () => ({ hang: true });
    const r = await adapter.exec(SRV, "sleep 99");
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("timed out after 30 ms");
    expect(r.evidence).toMatchObject({ timedOut: true, code: null });
  });

  it("unconfigured adapter → ok:false with a pointer to Settings", async () => {
    adapter = new SshAdapter(makeDeps({}, { config: () => undefined }).deps);
    const r = await adapter.exec(SRV, "id");
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/not configured/);
    expect(r.evidence).toMatchObject({ failure: "config" });
    expect(mock.clients).toHaveLength(0);
  });

  it("unmapped server → ok:false naming the PATCH endpoint", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    const r = await adapter.isolate("srv-api-01");
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("PATCH /api/fleet/servers/srv-api-01");
    expect(r.evidence).toMatchObject({ failure: "unreachable" });
  });

  it("missing private key → ok:false (config)", async () => {
    adapter = new SshAdapter(makeDeps({ keyRef: "nope" }).deps);
    const r = await adapter.exec(SRV, "id");
    expect(r.ok).toBe(false);
    expect(r.summary).toContain('keyRef "nope"');
  });

  it("auth / refused / DNS errors are classified with actionable summaries", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    mock.connectError = Object.assign(new Error("All configured authentication methods failed"), { level: "client-authentication" });
    let r = await adapter.exec(SRV, "id");
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("authorized_keys");
    expect(r.evidence).toMatchObject({ failure: "auth", host: "10.0.0.5", port: 2222 });

    mock.connectError = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    r = await adapter.exec(SRV, "id");
    expect(r.summary).toContain("connection refused");

    mock.connectError = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    r = await adapter.exec(SRV, "id");
    expect(r.summary).toContain("host not found");

    mock.connectError = Object.assign(new Error("Timed out while waiting for handshake"), { level: "client-timeout" });
    r = await adapter.exec(SRV, "id");
    expect(r.evidence).toMatchObject({ failure: "timeout" });
  });
});

describe("host-key policy", () => {
  it("accept-new pins the key on first contact and rejects a changed key afterwards", async () => {
    const { deps, known } = makeDeps();
    adapter = new SshAdapter(deps);
    expect((await adapter.exec(SRV, "id")).ok).toBe(true);
    expect(known.get("10.0.0.5:2222")).toBe(HOST_KEY.toString("base64"));

    await adapter.closeAll();
    mock.hostKey = Buffer.from("ssh-ed25519 EVIL");
    const r = await adapter.exec(SRV, "id");
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("HOST KEY MISMATCH");
    expect(r.evidence).toMatchObject({ failure: "hostkey" });
  });

  it("strict rejects an unpinned host and accepts a pinned one", async () => {
    const { deps, known } = makeDeps({ hostKeyPolicy: "strict" });
    adapter = new SshAdapter(deps);
    const r = await adapter.exec(SRV, "id");
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("not pinned");
    expect(r.evidence).toMatchObject({ failure: "hostkey" });
    expect(known.size).toBe(0);

    known.set("10.0.0.5:2222", HOST_KEY.toString("base64"));
    expect((await adapter.exec(SRV, "id")).ok).toBe(true);
  });
});

describe("connections", () => {
  it("reuses one connection per host and closes it after the idle timeout", async () => {
    adapter = new SshAdapter(makeDeps().deps);
    await adapter.exec(SRV, "a");
    await adapter.exec(SRV, "b");
    expect(mock.clients).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 120));
    expect(mock.clients[0].ended).toBe(true);
    await adapter.exec(SRV, "c");
    expect(mock.clients).toHaveLength(2);
  });

  it("dials the bastion first and forwards to the target through it", async () => {
    adapter = new SshAdapter(makeDeps({ bastion: { host: "jump.example.net", user: "jumper", keyRef: "kb", port: 2200 } }).deps);
    const r = await adapter.exec(SRV, "id");
    expect(r.ok).toBe(true);
    expect(mock.clients).toHaveLength(2);
    const [bastion, target] = mock.clients;
    expect(bastion.cfg).toMatchObject({ host: "jump.example.net", port: 2200, username: "jumper", privateKey: "PRIVATE-kb" });
    expect(bastion.forwards).toEqual([{ host: "10.0.0.5", port: 2222 }]);
    expect(target.cfg).toMatchObject({ username: "qalaa-agent", privateKey: "PRIVATE-k" });
    expect(target.cfg.sock).toBeInstanceOf(MockStream);
  });
});

describe("adapterFor", () => {
  it("returns sim by default, ssh only for servers flipped to adapter:'ssh', sim for '*'", async () => {
    const { getRuntime } = await import("@/server/runtime");
    const { store } = await import("@/server/store");
    const { adapterFor } = await import("@/server/fleet/adapters");
    getRuntime();
    const srv = store.server(SRV)!;
    expect(adapterFor(SRV).kind).toBe("sim");
    expect(adapterFor("*").kind).toBe("sim");
    expect(adapterFor(undefined).kind).toBe("sim");
    srv.adapter = "ssh";
    expect(adapterFor(SRV).kind).toBe("ssh");
    expect(adapterFor("srv-api-01").kind).toBe("sim");
    srv.adapter = "sim";
    expect(adapterFor(SRV).kind).toBe("sim");
    delete srv.adapter;
  });
});
