/**
 * The simulated environment (SPEC §3). Single mutation surface used by the
 * range engine AND agent tools (via adapters). observe() = agent-visible
 * projection that strips hidden attacker facts (§3.2).
 *
 * Every mutation records a "closure" entry (who closed which precondition)
 * so the range engine can attribute `blocked` steps exactly.
 */
import type { ISODate, ID } from "@/lib/types";
import { bus } from "../bus";
import { store } from "../store";

/* ─────────────────────────── model ─────────────────────────── */

export interface WorldAccount {
  id: ID;
  user: string;
  email: string;
  mfa: boolean;
  disabled: boolean;
  compromised: boolean;
  weakCreds: boolean;
}
export interface WorldToken {
  id: ID;
  accountId: ID;
  scope: "read" | "write" | "admin";
  revoked: boolean;
  exposedInDatasetId?: string;
  attackerHeld: boolean;
  lastUsedFromASN?: string;
  /** sim-iso of last use (for audit hygiene flags) */
  lastUsedAt?: ISODate;
}
export interface WorldDataset {
  id: ID;
  name: string;
  ownerAccountId: ID;
  public: boolean;
  format: "parquet" | "hdf5" | "json" | "csv";
  loader: "static" | "remote-code";
  templatedConfig: boolean;
  containsTokenIds: string[];
  malicious: boolean;
  quarantined: boolean;
  uploadedAt: ISODate;
}
export interface WorldRegistry {
  serverId: ID;
  version: string;
  tokenRefreshSigBypass: boolean;
  pluginInstallAllowed: boolean;
  locked: boolean;
  patched: boolean;
  attackerAdminToken: boolean;
  plugins: string[];
}
export interface WorldWorker {
  serverId: ID;
  envSecretIds: string[];
  fileDisclosurePatched: boolean;
  templateInjectionPatched: boolean;
  compromised: boolean;
}
export interface WorldSecret {
  id: ID;
  kind: "cloud" | "vpn" | "scm" | "messaging" | "storage" | "k8s";
  rotatedAt: ISODate;
  attackerHeld: boolean;
}
export interface WorldCluster {
  id: ID;
  name: string;
  nodeServerIds: string[];
  compromisedNodeIds: string[];
  cordoned: boolean;
  eastWestOpen: boolean;
}
export interface World {
  accounts: WorldAccount[];
  tokens: WorldToken[];
  datasets: WorldDataset[];
  registry: WorldRegistry;
  workers: WorldWorker[];
  secrets: WorldSecret[];
  clusters: WorldCluster[];
  network: {
    egressAllowed: Record<string, boolean>;
    blockedIps: string[];
    blockedSubnets: string[];
  };
  sandbox: { hardened: boolean; egressAllowed: boolean; ephemeralInstances: number };
  attacker: {
    hasInternet: boolean;
    c2Active: boolean;
    stagingAccounts: string[];
    datasetsRead: string[];
  };
  /** precondition key → who closed it (for range blockedBy attribution) */
  closures: Record<string, { agentId?: ID; toolName?: string; traceId?: ID; at: ISODate }>;
  /** facts revealed to agents by tools (observable overlay) */
  revealed: {
    maliciousDatasets: string[];
    exposedTokenIds: string[];
    serverFacts: Record<string, Record<string, boolean | number | string>>;
  };
}

export interface Actor {
  agentId?: ID;
  toolName?: string;
  traceId?: ID;
}

function w(): World {
  return store.s.world;
}

export function recordClosure(key: string, by?: Actor): void {
  if (!w().closures[key]) {
    w().closures[key] = { agentId: by?.agentId, toolName: by?.toolName, traceId: by?.traceId, at: store.now() };
  }
}

export function closureOf(key: string): World["closures"][string] | undefined {
  return w().closures[key];
}

function touch(): void {
  store.markDirty();
}

function emitServerUpdated(serverId: string, note: string): void {
  const srv = store.server(serverId);
  if (srv) {
    bus.emit("server.updated", { server: srv, note }, {
      summary: `${srv.hostname} — ${note}`,
      href: `/fleet?server=${srv.id}`,
    });
  }
  touch();
}

/* ─────────────────────────── agent-visible projection (§3.2) ─────────────────────────── */

export interface ObservedWorld {
  accounts: Omit<WorldAccount, "compromised" | "weakCreds">[];
  tokens: Omit<WorldToken, "attackerHeld" | "exposedInDatasetId"> &
    { revealedExposedInDatasetId?: string }[] extends never
    ? never
    : (Omit<WorldToken, "attackerHeld" | "exposedInDatasetId"> & {
        revealedExposedInDatasetId?: string;
      })[];
  datasets: (Omit<WorldDataset, "malicious" | "containsTokenIds"> & {
    malicious?: boolean;
  })[];
  registry: Omit<WorldRegistry, "tokenRefreshSigBypass" | "attackerAdminToken">;
  workers: Omit<WorldWorker, "compromised">[];
  secrets: Omit<WorldSecret, "attackerHeld">[];
  clusters: Omit<WorldCluster, "compromisedNodeIds">[];
  network: World["network"];
  sandbox: World["sandbox"];
}

export function observe(): ObservedWorld {
  return projectWorld(store.s.world);
}

/** Pure projection — usable before the store is initialized (seeding). */
export function projectWorld(world: World): ObservedWorld {
  const rev = world.revealed;
  return {
    accounts: world.accounts.map(({ compromised: _c, weakCreds: _w, ...a }) => a),
    tokens: world.tokens.map(({ attackerHeld: _h, exposedInDatasetId: _e, ...t }) => ({
      ...t,
      revealedExposedInDatasetId: rev.exposedTokenIds.includes(t.id)
        ? world.tokens.find((x) => x.id === t.id)?.exposedInDatasetId
        : undefined,
    })),
    datasets: world.datasets.map(({ malicious, containsTokenIds: _c, ...d }) => ({
      ...d,
      malicious: rev.maliciousDatasets.includes(d.id) ? malicious : undefined,
    })),
    registry: (() => {
      const { tokenRefreshSigBypass: _b, attackerAdminToken: _a, ...r } = world.registry;
      return r;
    })(),
    workers: world.workers.map(({ compromised: _c, ...wk }) => wk),
    secrets: world.secrets.map(({ attackerHeld: _h, ...s }) => s),
    // compromisedNodeIds is hidden — agents must detect node compromise via telemetry
    clusters: world.clusters.map(({ compromisedNodeIds: _n, ...c }) => c),
    network: {
      egressAllowed: { ...world.network.egressAllowed },
      blockedIps: [...world.network.blockedIps],
      blockedSubnets: [...world.network.blockedSubnets],
    },
    sandbox: { ...world.sandbox },
  };
}

/* ─────────────────────────── mutations (agent tools + range) ─────────────────────────── */

export function revokeToken(tokenId: string, by?: Actor): { ok: boolean; summary: string } {
  const tok = w().tokens.find((t) => t.id === tokenId);
  if (!tok) return { ok: false, summary: `token ${tokenId} not found` };
  if (tok.revoked) return { ok: true, summary: `${tokenId} already revoked` };
  tok.revoked = true;
  recordClosure(`token:${tokenId}`, by);
  recordClosure("tokens.exposed", by);
  touch();
  return { ok: true, summary: `revoked ${tokenId}` };
}

/** Revoke the exposed tokens agents have actually observed (revealed by
 * scans) — blind boundary: agents can't act on tokens they haven't seen. */
export function revokeRevealedTokens(by?: Actor): { ok: boolean; summary: string; count: number } {
  const exposed = w().tokens.filter((t) => t.exposedInDatasetId && !t.revoked && w().revealed.exposedTokenIds.includes(t.id));
  for (const t of exposed) {
    t.revoked = true;
    recordClosure(`token:${t.id}`, by);
  }
  if (exposed.length) recordClosure("tokens.exposed", by);
  touch();
  return { ok: true, summary: `revoked ${exposed.length} exposed token(s)`, count: exposed.length };
}

export function quarantineDataset(datasetId: string, by?: Actor): { ok: boolean; summary: string } {
  const ds = w().datasets.find((d) => d.id === datasetId || d.name === datasetId);
  if (!ds) return { ok: false, summary: `dataset ${datasetId} not found` };
  if (ds.quarantined) return { ok: true, summary: `${ds.name} already quarantined` };
  ds.quarantined = true;
  recordClosure(`dataset:${ds.id}:open`, by);
  touch();
  return { ok: true, summary: `quarantined ${ds.name}` };
}

export function lockRegistry(by?: Actor): { ok: boolean; summary: string } {
  const r = w().registry;
  if (r.locked) return { ok: true, summary: "registry already locked" };
  r.locked = true;
  r.pluginInstallAllowed = false;
  recordClosure("registry.unlocked", by);
  recordClosure("registry.pluginInstall", by);
  emitServerUpdated(r.serverId, "registry locked");
  return { ok: true, summary: `locked registry ${store.server(r.serverId)?.hostname ?? r.serverId}` };
}

export function patchRegistry(by?: Actor): { ok: boolean; summary: string } {
  const r = w().registry;
  r.patched = true;
  r.pluginInstallAllowed = false;
  recordClosure("registry.unpatched", by);
  recordClosure("registry.pluginInstall", by);
  emitServerUpdated(r.serverId, "registry patched");
  return { ok: true, summary: "registry patched to latest" };
}

export function isolateHost(serverId: string, by?: Actor): { ok: boolean; summary: string } {
  const srv = store.server(serverId);
  if (!srv) return { ok: false, summary: `server ${serverId} not found` };
  if (srv.status === "isolated") return { ok: true, summary: `${srv.hostname} already isolated` };
  srv.status = "isolated";
  w().network.egressAllowed[srv.id] = false;
  const worker = w().workers.find((wk) => wk.serverId === srv.id);
  if (worker) worker.compromised = false;
  recordClosure(`egress:${srv.id}`, by);
  recordClosure(`host:${srv.id}:online`, by);
  emitServerUpdated(srv.id, "host isolated");
  return { ok: true, summary: `isolated ${srv.hostname}` };
}

export function releaseHost(serverId: string, _by?: Actor): { ok: boolean; summary: string } {
  const srv = store.server(serverId);
  if (!srv) return { ok: false, summary: `server ${serverId} not found` };
  srv.status = "healthy";
  w().network.egressAllowed[srv.id] = true;
  emitServerUpdated(srv.id, "host released");
  return { ok: true, summary: `released ${srv.hostname}` };
}

export function blockEgress(serverId: string, by?: Actor, ip?: string): { ok: boolean; summary: string } {
  const n = w().network;
  if (ip) {
    if (!n.blockedIps.includes(ip)) n.blockedIps.push(ip);
    recordClosure(`egress:ip:${ip}`, by);
    touch();
    return { ok: true, summary: `blocked egress to ${ip}` };
  }
  const srv = store.server(serverId);
  if (!srv) return { ok: false, summary: `server ${serverId} not found` };
  n.egressAllowed[srv.id] = false;
  recordClosure(`egress:${srv.id}`, by);
  emitServerUpdated(srv.id, "egress blocked");
  return { ok: true, summary: `blocked egress for ${srv.hostname}` };
}

export function cordonCluster(clusterId: string, by?: Actor): { ok: boolean; summary: string } {
  const c = w().clusters.find((x) => x.id === clusterId || x.name === clusterId);
  if (!c) return { ok: false, summary: `cluster ${clusterId} not found` };
  c.cordoned = true;
  c.eastWestOpen = false;
  recordClosure(`cluster:${c.id}:open`, by);
  touch();
  return { ok: true, summary: `cordoned cluster ${c.name}` };
}

export function rotateSecret(secretIdOrKind: string, by?: Actor): { ok: boolean; summary: string; count: number } {
  const sec = w().secrets;
  const targets = sec.filter((s) => s.id === secretIdOrKind || s.kind === secretIdOrKind);
  if (!targets.length) return { ok: false, summary: `secret ${secretIdOrKind} not found`, count: 0 };
  const now = store.now();
  for (const s of targets) {
    s.rotatedAt = now;
    s.attackerHeld = false;
  }
  for (const s of targets) recordClosure(`secret:${s.id}:held`, by);
  recordClosure(`secrets:${targets[0].kind}:unrotated`, by);
  touch();
  return { ok: true, summary: `rotated ${targets.length} ${targets[0].kind} secret(s)`, count: targets.length };
}

export function rotateSecretsForServer(serverId: string, by?: Actor): { ok: boolean; summary: string; count: number } {
  const worker = w().workers.find((x) => x.serverId === serverId);
  const idsToRotate = worker ? worker.envSecretIds : [];
  let count = 0;
  const now = store.now();
  for (const s of w().secrets) {
    if (idsToRotate.includes(s.id)) {
      s.rotatedAt = now;
      s.attackerHeld = false;
      count++;
      recordClosure(`secret:${s.id}:held`, by);
    }
  }
  if (count) touch();
  const host = store.server(serverId)?.hostname ?? serverId;
  return { ok: count > 0, summary: `rotated ${count} secret(s) on ${host}`, count };
}

export function patchWorker(serverId: string, kind: "file-disclosure" | "template-injection" | "all", by?: Actor): { ok: boolean; summary: string } {
  const wk = w().workers.find((x) => x.serverId === serverId);
  if (!wk) return { ok: false, summary: `no worker record for ${serverId}` };
  if (kind === "file-disclosure" || kind === "all") {
    wk.fileDisclosurePatched = true;
    recordClosure(`worker:${serverId}:fd-unpatched`, by);
  }
  if (kind === "template-injection" || kind === "all") {
    wk.templateInjectionPatched = true;
    recordClosure(`worker:${serverId}:ti-unpatched`, by);
  }
  emitServerUpdated(serverId, "worker patched");
  return { ok: true, summary: `patched ${kind} on ${store.server(serverId)?.hostname ?? serverId}` };
}

export function hardenSandbox(by?: Actor): { ok: boolean; summary: string } {
  const sb = w().sandbox;
  sb.hardened = true;
  sb.egressAllowed = false;
  recordClosure("sandbox.egress", by);
  recordClosure("sandbox.unhardened", by);
  touch();
  return { ok: true, summary: "sandbox hardened; egress denied" };
}

export function rebuildNode(serverId: string, by?: Actor): { ok: boolean; summary: string } {
  const srv = store.server(serverId);
  if (!srv) return { ok: false, summary: `server ${serverId} not found` };
  srv.status = "healthy";
  for (const c of w().clusters) {
    c.compromisedNodeIds = c.compromisedNodeIds.filter((id) => id !== srv.id);
  }
  const wk = w().workers.find((x) => x.serverId === srv.id);
  if (wk) {
    wk.compromised = false;
    wk.fileDisclosurePatched = true;
    wk.templateInjectionPatched = true;
    recordClosure(`worker:${srv.id}:fd-unpatched`, by);
    recordClosure(`worker:${srv.id}:ti-unpatched`, by);
  }
  recordClosure(`host:${srv.id}:vulnerable`, by);
  emitServerUpdated(srv.id, "node rebuilt from clean image");
  return { ok: true, summary: `rebuilt ${srv.hostname}` };
}

export function disableAccount(accountId: string, by?: Actor): { ok: boolean; summary: string } {
  const acc = w().accounts.find((a) => a.id === accountId || a.user === accountId || a.email === accountId);
  if (!acc) return { ok: false, summary: `account ${accountId} not found` };
  acc.disabled = true;
  acc.compromised = false;
  recordClosure(`account:${acc.id}:enabled`, by);
  touch();
  return { ok: true, summary: `disabled account ${acc.user}` };
}

export function enforceMfa(accountId: string, by?: Actor): { ok: boolean; summary: string } {
  const acc = w().accounts.find((a) => a.id === accountId || a.user === accountId);
  if (!acc) return { ok: false, summary: `account ${accountId} not found` };
  acc.mfa = true;
  acc.weakCreds = false;
  recordClosure(`account:${acc.id}:weak`, by);
  touch();
  return { ok: true, summary: `MFA enforced for ${acc.user}` };
}

export function remediateConfig(serverId: string, by?: Actor): { ok: boolean; summary: string } {
  // drift remediation: registry plugin installs off, remote-code loaders off on workers
  const r = w().registry;
  if (r.serverId === serverId) {
    if (r.pluginInstallAllowed) {
      r.pluginInstallAllowed = false;
      recordClosure("registry.pluginInstall", by);
      emitServerUpdated(serverId, "plugin install disabled");
      return { ok: true, summary: "disabled plugin installs on registry" };
    }
    return { ok: true, summary: "registry already conformant" };
  }
  const wk = w().workers.find((x) => x.serverId === serverId);
  if (wk) {
    const ds = w().datasets.filter((d) => d.loader === "remote-code");
    for (const d of ds) d.loader = "static";
    emitServerUpdated(serverId, "remote-code loaders disabled");
    return { ok: true, summary: "disabled remote-code dataset loaders" };
  }
  return { ok: false, summary: `nothing to remediate on ${serverId}` };
}

/* ── attacker-side mutations (range engine only) ── */

export function compromiseAccount(accountId: string): void {
  const acc = w().accounts.find((a) => a.id === accountId);
  if (acc) acc.compromised = true;
  touch();
}
export function grantRegistryAdmin(): void {
  w().registry.attackerAdminToken = true;
  touch();
}
export function installRegistryPlugin(name: string): void {
  w().registry.plugins.push(name);
  const srv = store.server(w().registry.serverId);
  if (srv) srv.status = "compromised";
  emitServerUpdated(w().registry.serverId, "plugin installed");
}
export function setAttackerInternet(v: boolean): void {
  w().attacker.hasInternet = v;
  touch();
}
export function holdTokens(tokenIds: string[]): void {
  for (const id of tokenIds) {
    const t = w().tokens.find((x) => x.id === id);
    if (t) t.attackerHeld = true;
  }
  touch();
}
export function addDataset(ds: WorldDataset): void {
  w().datasets.push(ds);
  touch();
}
export function holdSecrets(idsToHold: string[]): void {
  for (const id of idsToHold) {
    const s = w().secrets.find((x) => x.id === id);
    if (s) s.attackerHeld = true;
  }
  touch();
}
export function compromiseWorker(serverId: string): void {
  const wk = w().workers.find((x) => x.serverId === serverId);
  if (wk) wk.compromised = true;
  const srv = store.server(serverId);
  if (srv) srv.status = "compromised";
  touch();
}
export function compromiseNode(serverId: string): void {
  const srv = store.server(serverId);
  if (srv) srv.status = "compromised";
  for (const c of w().clusters) {
    if (c.nodeServerIds.includes(serverId) && !c.compromisedNodeIds.includes(serverId)) {
      c.compromisedNodeIds.push(serverId);
    }
  }
  emitServerUpdated(serverId, "node compromised");
}
export function activateC2(): void {
  w().attacker.c2Active = true;
  touch();
}
export function addDatasetsRead(datasetIds: string[]): void {
  w().attacker.datasetsRead.push(...datasetIds);
  touch();
}
export function addEphemeralInstances(n: number): void {
  w().sandbox.ephemeralInstances += n;
  touch();
}
export function addStagingAccount(acc: string): void {
  w().attacker.stagingAccounts.push(acc);
  touch();
}

/* ── reveal helpers (tools pull hidden facts into the observable view) ── */
export function revealMaliciousDataset(id: string): void {
  if (!w().revealed.maliciousDatasets.includes(id)) w().revealed.maliciousDatasets.push(id);
  touch();
}
export function revealExposedToken(id: string): void {
  if (!w().revealed.exposedTokenIds.includes(id)) w().revealed.exposedTokenIds.push(id);
  touch();
}
export function revealServerFact(serverId: string, key: string, value: boolean | number | string): void {
  const rf = w().revealed.serverFacts;
  (rf[serverId] ??= {})[key] = value;
  touch();
}
