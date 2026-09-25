/**
 * SshAdapterConfig — persisted in .data/secrets.json (`store.secrets.ssh`)
 * next to the key material it references (`store.secrets.sshKeys[keyRef]`)
 * and the pinned host keys (`store.secrets.sshKnownHosts`).
 *
 * `settings.ssh` (state.json, returned by GET /api/settings) is the redacted
 * projection built by `sshSettingsView()`: booleans instead of keys, counts
 * instead of host-key blobs. Mirrors how `llm.apiKey` → `llm.apiKeySet`.
 */
import type { ID, SshHostKeyPolicy, SshSettings, SshSettingsPatch } from "@/lib/types";
import { store } from "../../store";

export interface SshBastionConfig {
  host: string;
  user: string;
  /** secret id in `store.secrets.sshKeys`; falls back to the target keyRef */
  keyRef: string;
  port?: number;
}

export interface SshAdapterConfig {
  /** login user on the hosts, e.g. "qalaa-agent" */
  user: string;
  /** secret id holding the private key (`store.secrets.sshKeys[keyRef]`) */
  keyRef: string;
  /** default 22 */
  port?: number;
  bastion?: SshBastionConfig;
  hostKeyPolicy: SshHostKeyPolicy;
  /** wrap commands in `sudo -n` */
  sudo?: boolean;
  /** per-command timeout, default 15000 */
  timeoutMs?: number;
  /** serverId → reachable `host[:port]` */
  hostMap?: Record<ID, string>;
  /** `migrate` POSTs `{ action:"migrate", sourceId, targetId, workloads }` here; unset → migrate refuses */
  orchestratorUrl?: string;
}

export const DEFAULT_KEY_REF = "ssh-default";
export const DEFAULT_BASTION_KEY_REF = "ssh-bastion";
export const DEFAULT_SSH_PORT = 22;
export const DEFAULT_SSH_TIMEOUT_MS = 15_000;

export const DEFAULT_SSH_SETTINGS: SshSettings = {
  user: "qalaa-agent",
  port: DEFAULT_SSH_PORT,
  hostKeyPolicy: "accept-new",
  sudo: false,
  timeoutMs: DEFAULT_SSH_TIMEOUT_MS,
  keySet: false,
  hostMap: {},
  knownHostsCount: 0,
};

/** Current config from secrets, or `undefined` when nothing was ever saved. */
export function sshConfig(): SshAdapterConfig | undefined {
  return store.secrets.ssh;
}

export function sshKey(keyRef: string): string | undefined {
  return store.secrets.sshKeys?.[keyRef];
}

export function sshConfigured(): boolean {
  const c = sshConfig();
  return !!c && !!c.user && !!sshKey(c.keyRef);
}

/** Redacted projection for the API / UI. Never includes key material or host-key blobs. */
export function sshSettingsView(prev?: Partial<SshSettings>): SshSettings {
  const c = sshConfig();
  const knownHostsCount = Object.keys(store.secrets.sshKnownHosts ?? {}).length;
  if (!c) return { ...DEFAULT_SSH_SETTINGS, knownHostsCount, lastTest: prev?.lastTest };
  return {
    user: c.user,
    port: c.port ?? DEFAULT_SSH_PORT,
    hostKeyPolicy: c.hostKeyPolicy,
    sudo: !!c.sudo,
    timeoutMs: c.timeoutMs ?? DEFAULT_SSH_TIMEOUT_MS,
    keySet: !!sshKey(c.keyRef),
    bastion: c.bastion
      ? { host: c.bastion.host, port: c.bastion.port ?? DEFAULT_SSH_PORT, user: c.bastion.user, keySet: !!sshKey(c.bastion.keyRef) }
      : undefined,
    hostMap: { ...(c.hostMap ?? {}) },
    knownHostsCount,
    orchestratorUrl: c.orchestratorUrl,
    lastTest: prev?.lastTest,
  };
}

/** Recompute `settings.ssh` from secrets (boot + after every PATCH). */
export function syncSshSettings(): SshSettings {
  const s = store.s.settings;
  s.ssh = sshSettingsView(s.ssh);
  return s.ssh;
}

/** Merge a PATCH into secrets. Returns the redacted view. */
export function applySshSettingsPatch(p: SshSettingsPatch): SshSettings {
  const cur: SshAdapterConfig = store.secrets.ssh ?? {
    user: DEFAULT_SSH_SETTINGS.user,
    keyRef: DEFAULT_KEY_REF,
    hostKeyPolicy: DEFAULT_SSH_SETTINGS.hostKeyPolicy,
  };
  const keys = (store.secrets.sshKeys ??= {});
  if (p.user !== undefined) cur.user = p.user;
  if (p.port !== undefined) cur.port = p.port;
  if (p.hostKeyPolicy !== undefined) cur.hostKeyPolicy = p.hostKeyPolicy;
  if (p.sudo !== undefined) cur.sudo = p.sudo;
  if (p.timeoutMs !== undefined) cur.timeoutMs = p.timeoutMs;
  if (p.privateKey !== undefined) {
    if (p.privateKey) keys[cur.keyRef] = p.privateKey;
    else delete keys[cur.keyRef];
  }
  if (p.bastion === null) {
    if (cur.bastion) delete keys[cur.bastion.keyRef];
    delete cur.bastion;
  } else if (p.bastion) {
    const b: SshBastionConfig = cur.bastion ?? { host: "", user: cur.user, keyRef: DEFAULT_BASTION_KEY_REF };
    if (p.bastion.host !== undefined) b.host = p.bastion.host;
    if (p.bastion.port !== undefined) b.port = p.bastion.port;
    if (p.bastion.user !== undefined) b.user = p.bastion.user;
    if (p.bastion.privateKey !== undefined) {
      if (p.bastion.privateKey) keys[b.keyRef] = p.bastion.privateKey;
      else delete keys[b.keyRef];
    }
    if (b.host) cur.bastion = b;
    else delete cur.bastion;
  }
  if (p.hostMap) cur.hostMap = { ...(cur.hostMap ?? {}), ...p.hostMap };
  if (p.orchestratorUrl === null) delete cur.orchestratorUrl;
  else if (p.orchestratorUrl !== undefined) cur.orchestratorUrl = p.orchestratorUrl;
  if (p.forgetKnownHosts) store.secrets.sshKnownHosts = {};
  store.secrets.ssh = cur;
  store.saveSecrets();
  const view = syncSshSettings();
  store.markDirty();
  return view;
}

/** Point a server at a reachable address (feeds `hostMap`). `undefined` removes the mapping. */
export function setSshTarget(serverId: ID, target: string | undefined): void {
  const cur: SshAdapterConfig = store.secrets.ssh ?? {
    user: DEFAULT_SSH_SETTINGS.user,
    keyRef: DEFAULT_KEY_REF,
    hostKeyPolicy: DEFAULT_SSH_SETTINGS.hostKeyPolicy,
  };
  cur.hostMap ??= {};
  if (target) cur.hostMap[serverId] = target;
  else delete cur.hostMap[serverId];
  store.secrets.ssh = cur;
  store.saveSecrets();
  syncSshSettings();
  store.markDirty();
}
