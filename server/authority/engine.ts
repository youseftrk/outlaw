/**
 * The authority engine (docs/PIVOT.md §4) — the one switch that grants and
 * instantly takes back an agent's power. Agents hold no standing rights:
 * every protected call is checked server-side against an ACTIVE lease the
 * owning entity accepted. Step-up codes are sha-256 hashed at rest and only
 * ever travel in the delivered Saqr message — never in a GET response.
 */
import { createHash, randomInt } from "node:crypto";
import type {
  Agent,
  AuthorityCheck,
  AuthorityLease,
  AuthorityPath,
  AuthorityPathNode,
  AuthorityScope,
  AuthorizeInput,
  AuthorizeResult,
  Capability,
  DataClass,
  DecisionKind,
  DecisionRecord,
  DrillState,
  Entity,
  HouseRules,
  ID,
  OnboardInput,
  PermissionSuggestion,
  RefusalCode,
  Server,
  StepUpChallenge,
} from "@/lib/types";
import { CAPABILITY_LABEL, DATA_CLASS_LABEL } from "@/lib/types";
import { bus } from "../bus";
import { ids } from "../ids";
import { store } from "../store";
import { G } from "../shared";
import { iso } from "../time";
import { ownerForServer, seedObserveLeases } from "../seed/entities";

export const STEP_UP_TTL_SIM_SEC = 5 * 60;
export const STEP_UP_MAX_ATTEMPTS = 3;
export const LEASE_WAIT_MAX_SIM_SEC = 10 * 60;

/* ─────────────────────────── lookups ─────────────────────────── */

export function entity(id?: ID): Entity | undefined {
  return store.s.entities.find((e) => e.id === id);
}
export function entityName(id?: ID): string {
  return entity(id)?.name ?? id ?? "unknown";
}
export function lease(id?: ID): AuthorityLease | undefined {
  return store.s.leases.find((l) => l.id === id);
}
export function rulesFor(entityId: ID | undefined): HouseRules {
  const found = store.s.rules.find((r) => r.entityId === entityId);
  if (found) return found;
  return { entityId: entityId ?? "", allowed: ["observe", "contain", "credentials", "data", "repair"], stepUp: ["contain", "credentials", "repair"], neverShared: [], maxDurationSec: 24 * 3600 };
}

/** who asks: actorId may be an agent id (its operating entity) or an entity id */
export function requestingEntityOf(actorId: ID): { entityId: ID; agent?: Agent } {
  const agent = store.agent(actorId);
  if (agent) return { entityId: agent.entityId ?? "ent-response", agent };
  if (entity(actorId)) return { entityId: actorId };
  return { entityId: actorId };
}

/** who owns the target: server → ownerEntityId; cluster → nodes' owner; estate resources → ent-data */
export function ownerForTarget(input: AuthorizeInput): { ownerEntityId?: ID; server?: Server } {
  if (input.serverId) {
    const srv = store.server(input.serverId);
    return { ownerEntityId: srv ? srv.ownerEntityId : undefined, server: srv };
  }
  if (input.cluster) {
    const cl = store.s.world.clusters.find((c) => c.name === input.cluster || c.id === input.cluster);
    const first = cl?.nodeServerIds.map((id) => store.server(id)).find(Boolean);
    return { ownerEntityId: first?.ownerEntityId ?? ownerForServer({ env: "prod" }) };
  }
  return { ownerEntityId: input.ownerEntityId };
}

/* ─────────────────────────── scope + rules helpers ─────────────────────────── */

const norm = (arr?: string[]) => (arr && arr.length ? [...arr].sort() : []);
export function scopeKey(scope: AuthorityScope): string {
  return `s:${norm(scope.serverIds)}|c:${norm(scope.clusters)}|e:${norm(scope.envs)}`;
}
export const isEmptyScope = (scope: AuthorityScope) =>
  !scope.serverIds?.length && !scope.clusters?.length && !scope.envs?.length;

/** does `scope` cover this authorize target? empty scope = whole estate */
export function scopeCovers(scope: AuthorityScope, input: AuthorizeInput): boolean {
  if (isEmptyScope(scope)) return true;
  const srv = input.serverId ? store.server(input.serverId) : undefined;
  if (input.cluster) {
    const cl = store.s.world.clusters.find((c) => c.name === input.cluster || c.id === input.cluster);
    if (!cl) return false;
    if (scope.clusters?.includes(cl.name) || scope.clusters?.includes(cl.id)) return true;
    if (cl.nodeServerIds.some((id) => scope.serverIds?.includes(id))) return true;
    return !!srv;
  }
  if (!srv) return false;
  if (scope.serverIds?.includes(srv.id)) return true;
  const inCluster = store.s.world.clusters.find((c) => c.nodeServerIds.includes(srv.id));
  if (inCluster && (scope.clusters?.includes(inCluster.name) || scope.clusters?.includes(inCluster.id))) return true;
  if (scope.envs?.includes(srv.env)) return true;
  return false;
}

/** servers a scope reaches (used by the never-shared rules check) */
export function scopeServers(scope: AuthorityScope, ownerEntityId: ID): Server[] {
  const owned = store.s.servers.filter((s) => s.ownerEntityId === ownerEntityId);
  if (isEmptyScope(scope)) return owned;
  const out = new Map<ID, Server>();
  for (const id of scope.serverIds ?? []) {
    const s = owned.find((x) => x.id === id);
    if (s) out.set(s.id, s);
  }
  for (const cn of scope.clusters ?? []) {
    const cl = store.s.world.clusters.find((c) => c.name === cn || c.id === cn);
    for (const id of cl?.nodeServerIds ?? []) {
      const s = owned.find((x) => x.id === id);
      if (s) out.set(s.id, s);
    }
  }
  for (const env of scope.envs ?? []) {
    for (const s of owned.filter((x) => x.env === env)) out.set(s.id, s);
  }
  return [...out.values()];
}

function neverSharedHit(scope: AuthorityScope, ownerEntityId: ID): DataClass | null {
  const rules = rulesFor(ownerEntityId);
  if (!rules.neverShared.length) return null;
  for (const s of scopeServers(scope, ownerEntityId)) {
    const hit = s.dataClasses?.find((d) => rules.neverShared.includes(d));
    if (hit) return hit;
  }
  return null;
}

/** plain-language RULES_EXCEEDED reason, or null when the ask fits the owner's rules */
export function rulesBlock(input: {
  ownerEntityId: ID;
  capability: Capability;
  scope: AuthorityScope;
  durationSec: number;
}): string | null {
  const rules = rulesFor(input.ownerEntityId);
  const owner = entityName(input.ownerEntityId);
  if (!rules.allowed.includes(input.capability)) {
    return `The ${owner} never lends "${CAPABILITY_LABEL[input.capability]}" powers.`;
  }
  if (rules.maxDurationSec > 0 && input.durationSec > rules.maxDurationSec) {
    return `The ${owner} allows at most ${Math.round(rules.maxDurationSec / 3600) || rules.maxDurationSec} ${rules.maxDurationSec >= 3600 ? "hour(s)" : "seconds"} — this asks for ${Math.round(input.durationSec / 3600)}h.`;
  }
  if (input.capability === "observe" || input.capability === "data") {
    const hit = neverSharedHit(input.scope, input.ownerEntityId);
    if (hit) return `The ${owner} never shares ${DATA_CLASS_LABEL[hit].toLowerCase()}.`;
  }
  return null;
}

/* ─────────────────────────── checks + decision ─────────────────────────── */

export const CHECK_LABELS = [
  "Permission exists",
  "Owner said yes",
  "Human code entered",
  "Still within the agreed time",
  "Not taken back",
  "Right agent",
  "What the agent may do matches",
  "Where it may act matches",
  "Owner never shares this data",
] as const;

const DATA_READ_CAPS: Capability[] = ["observe", "data"];

function checkRow(lease: AuthorityLease | undefined, input: AuthorizeInput, agent: Agent | undefined, ownerEntityId: ID | undefined): AuthorityCheck[] {
  const nowMs = store.s.simNowMs;
  const rules = ownerEntityId ? rulesFor(ownerEntityId) : undefined;
  const srv = input.serverId ? store.server(input.serverId) : undefined;
  const neverSharedOk = !(
    srv && rules && DATA_READ_CAPS.includes(input.capability) && srv.dataClasses?.some((d) => rules.neverShared.includes(d))
  );
  const saidYes = !!lease && (lease.status === "active" || lease.status === "pending-step-up" || !!lease.acceptedAt);
  const codeOk = !!lease && (!lease.stepUpRequired || !!lease.stepUpCompletedAt);
  const timeOk = !!lease && !!lease.activatedAt && !!lease.expiresAt && new Date(lease.expiresAt).getTime() > nowMs;
  return [
    { label: CHECK_LABELS[0], passed: !!lease },
    { label: CHECK_LABELS[1], passed: saidYes },
    { label: CHECK_LABELS[2], passed: codeOk },
    { label: CHECK_LABELS[3], passed: timeOk },
    { label: CHECK_LABELS[4], passed: !!lease && !lease.revokedAt },
    { label: CHECK_LABELS[5], passed: !!lease && (!lease.agentId || lease.agentId === agent?.id) },
    { label: CHECK_LABELS[6], passed: !!lease && lease.capability === input.capability },
    { label: CHECK_LABELS[7], passed: !!lease && scopeCovers(lease.scope, input) },
    { label: CHECK_LABELS[8], passed: neverSharedOk },
  ];
}

/** refusal for one lease, in PIVOT §4 order; null = this lease allows */
function refusalFor(l: AuthorityLease, input: AuthorizeInput, agent: Agent | undefined, ownerEntityId: ID): { code: RefusalCode; message: string } | null {
  const nowMs = store.s.simNowMs;
  const owner = entityName(ownerEntityId);
  if (l.status === "pending") return { code: "AUTHORITY_PENDING", message: `The ${owner} hasn't answered yet.` };
  if (l.status === "pending-step-up") return { code: "STEP_UP_REQUIRED", message: `Waiting on the one-time human code for ${l.id}.` };
  if (l.status === "declined") return { code: "AUTHORITY_REQUIRED", message: `The ${owner} said no.` };
  if (l.status === "expired") return { code: "AUTHORITY_EXPIRED", message: `Permission ${l.id} ran out of time.` };
  if (l.status === "revoked") {
    const windowEnd = l.activatedAt ? new Date(l.activatedAt).getTime() + l.durationSec * 1000 : 0;
    return nowMs <= windowEnd
      ? { code: "AUTHORITY_REVOKED", message: `The ${owner} took permission ${l.id} back.` }
      : { code: "AUTHORITY_REQUIRED", message: `Permission ${l.id} was revoked after its window.` };
  }
  if (l.capability !== input.capability) return { code: "CAPABILITY_MISMATCH", message: `${l.id} covers ${CAPABILITY_LABEL[l.capability]}, not ${CAPABILITY_LABEL[input.capability]}.` };
  if (l.agentId && l.agentId !== agent?.id) return { code: "REQUESTER_MISMATCH", message: `${l.id} belongs to ${store.agent(l.agentId)?.name ?? l.agentId}, not ${agent?.name ?? input.actorId}.` };
  if (!scopeCovers(l.scope, input)) return { code: "SCOPE_MISMATCH", message: `${l.id} doesn't cover this system.` };
  if (l.expiresAt && new Date(l.expiresAt).getTime() <= nowMs) return { code: "AUTHORITY_EXPIRED", message: `Permission ${l.id} ran out of time.` };
  if (l.stepUpRequired && !l.stepUpCompletedAt) return { code: "STEP_UP_REQUIRED", message: `${l.id} still needs the one-time human code.` };
  const rules = rulesFor(ownerEntityId);
  const srv = input.serverId ? store.server(input.serverId) : undefined;
  if (srv && DATA_READ_CAPS.includes(input.capability) && srv.dataClasses?.some((d) => rules.neverShared.includes(d))) {
    const hit = srv.dataClasses.find((d) => rules.neverShared.includes(d))!;
    return { code: "NEVER_SHARED", message: `The ${owner} never shares ${DATA_CLASS_LABEL[hit].toLowerCase()} — no permission changes that.` };
  }
  return null;
}

const REFUSAL_RANK: RefusalCode[] = [
  "STEP_UP_REQUIRED",
  "AUTHORITY_PENDING",
  "REQUESTER_MISMATCH",
  "CAPABILITY_MISMATCH",
  "SCOPE_MISMATCH",
  "NEVER_SHARED",
  "AUTHORITY_REVOKED",
  "AUTHORITY_EXPIRED",
  "RULES_EXCEEDED",
  "AUTHORITY_REQUIRED",
];

function rank(code: RefusalCode): number {
  const i = REFUSAL_RANK.indexOf(code);
  return i < 0 ? REFUSAL_RANK.length : i;
}

const STATUS_ORDER: AuthorityLease["status"][] = ["active", "pending-step-up", "pending", "revoked", "expired", "declined"];

/** The pure decision — runs on every protected call, PIVOT §4 order. */
export function authorize(input: AuthorizeInput): AuthorizeResult {
  const { entityId, agent } = requestingEntityOf(input.actorId);
  const { ownerEntityId } = ownerForTarget(input);
  if (!ownerEntityId) {
    const checks = checkRow(undefined, input, agent, undefined);
    return { allow: false, code: "AUTHORITY_REQUIRED", checks, message: `No entity owns this target — nothing can grant permission.` };
  }

  // same-entity short-circuit: an entity's own agents on its own systems
  if (entityId === ownerEntityId) {
    const now = store.now();
    const self: AuthorityLease = {
      id: `self-${entityId}`,
      requestingEntityId: entityId,
      ownerEntityId,
      capability: input.capability,
      scope: {},
      justification: "own systems",
      durationSec: 0,
      status: "active",
      requestedAt: now,
      activatedAt: now,
      stepUpRequired: false,
      uses: 0,
    };
    const checks = checkRow(undefined, input, agent, ownerEntityId).map((c) => ({ ...c, passed: true }));
    return { allow: true, lease: self, ownerEntityId, checks };
  }

  const candidates = store.s.leases
    .filter((l) => l.requestingEntityId === entityId && l.ownerEntityId === ownerEntityId && l.capability === input.capability)
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.requestedAt.localeCompare(a.requestedAt));

  let best: { refusal: { code: RefusalCode; message: string }; lease?: AuthorityLease } | null = null;
  for (const l of candidates) {
    const refusal = refusalFor(l, input, agent, ownerEntityId);
    if (!refusal) {
      l.uses += 1;
      store.markDirty();
      return { allow: true, lease: l, ownerEntityId, checks: checkRow(l, input, agent, ownerEntityId) };
    }
    if (!best || rank(refusal.code) < rank(best.refusal.code)) best = { refusal, lease: l };
  }
  if (best) {
    return { allow: false, code: best.refusal.code, ownerEntityId, lease: best.lease, message: best.refusal.message, checks: checkRow(best.lease, input, agent, ownerEntityId) };
  }
  return { allow: false, code: "AUTHORITY_REQUIRED", ownerEntityId, message: `No permission from the ${entityName(ownerEntityId)} covers this.`, checks: checkRow(undefined, input, agent, ownerEntityId) };
}

/* ─────────────────────────── the record ─────────────────────────── */

export function record(kind: DecisionKind, opts: Partial<DecisionRecord> & { actor: string }): DecisionRecord {
  const rec: DecisionRecord = {
    id: ids.record(),
    at: store.now(),
    kind,
    actorName: opts.actorName ?? opts.actor,
    summary: "",
    ...opts,
  } as DecisionRecord;
  rec.summary = opts.summary ?? rec.summary;
  store.s.records.push(rec);
  store.markDirty();
  return rec;
}

function emit(type: "authority.requested" | "authority.updated" | "authority.decision", payload: unknown, summary: string, severity: "low" | "medium" | "high" = "medium") {
  bus.emit(type, payload, { severity, summary, href: "/permissions" });
}

export function describeScope(scope: AuthorityScope): string {
  if (isEmptyScope(scope)) return "the whole estate";
  const parts: string[] = [];
  if (scope.serverIds?.length) parts.push(scope.serverIds.map((id) => store.server(id)?.hostname ?? id).join(", "));
  if (scope.clusters?.length) parts.push(`cluster ${scope.clusters.join(", ")}`);
  if (scope.envs?.length) parts.push(`${scope.envs.join("+")} systems`);
  return parts.join(" · ") || "the whole estate";
}

/* ─────────────────────────── lifecycle ─────────────────────────── */

export interface RequestInput {
  requestingEntityId: ID;
  ownerEntityId: ID;
  agentId?: ID;
  capability: Capability;
  scope: AuthorityScope;
  justification: string;
  incidentId?: ID;
  durationSec: number;
}

export function request(input: RequestInput, by: string): { ok: true; lease: AuthorityLease; created: boolean } | { ok: false; status: number; code?: RefusalCode; message: string; lease?: AuthorityLease } {
  const requester = entity(input.requestingEntityId);
  const owner = entity(input.ownerEntityId);
  if (!requester || !owner) return { ok: false, status: 404, message: "unknown entity" };
  if (input.requestingEntityId === input.ownerEntityId) {
    return { ok: false, status: 400, code: "RULES_EXCEEDED", message: "An entity does not ask itself for permission — it already owns its systems." };
  }
  const agent = input.agentId ? store.agent(input.agentId) : undefined;
  if (agent && (agent.entityId ?? "ent-response") !== input.requestingEntityId) {
    return { ok: false, status: 400, code: "REQUESTER_MISMATCH", message: `${agent.name} is operated by the ${entityName(agent.entityId ?? "ent-response")}, not the ${requester.name}.` };
  }
  const blocked = rulesBlock({ ownerEntityId: input.ownerEntityId, capability: input.capability, scope: input.scope, durationSec: input.durationSec });
  if (blocked) {
    return { ok: false, status: 400, code: "RULES_EXCEEDED", message: blocked };
  }
  const key = scopeKey(input.scope);
  const existing = store.s.leases.find(
    (l) =>
      l.requestingEntityId === input.requestingEntityId &&
      l.ownerEntityId === input.ownerEntityId &&
      l.capability === input.capability &&
      scopeKey(l.scope) === key &&
      ["pending", "pending-step-up", "active"].includes(l.status) &&
      (!l.agentId || !input.agentId || l.agentId === input.agentId)
  );
  if (existing) return { ok: true, lease: existing, created: false };

  const rules = rulesFor(input.ownerEntityId);
  const lease: AuthorityLease = {
    id: ids.lease(),
    requestingEntityId: input.requestingEntityId,
    ownerEntityId: input.ownerEntityId,
    agentId: input.agentId,
    capability: input.capability,
    scope: input.scope,
    justification: input.justification,
    incidentId: input.incidentId,
    durationSec: input.durationSec,
    status: "pending",
    requestedAt: store.now(),
    stepUpRequired: rules.stepUp.includes(input.capability),
    uses: 0,
  };
  store.s.leases.push(lease);
  store.markDirty();
  record("asked", {
    actor: by,
    leaseId: lease.id,
    requestingEntityId: lease.requestingEntityId,
    ownerEntityId: lease.ownerEntityId,
    capability: lease.capability,
    target: describeScope(lease.scope),
    summary: `${requester.name} asked the ${owner.name} to ${CAPABILITY_LABEL[lease.capability].toLowerCase()} on ${describeScope(lease.scope)} — ${lease.justification}`,
  });
  emit("authority.requested", { lease }, `${requester.shortName} asked ${owner.shortName}: ${CAPABILITY_LABEL[lease.capability].toLowerCase()} on ${describeScope(lease.scope)}`, "medium");
  void (async () => {
    const { sendMessage } = await import("../messaging/composer");
    sendMessage("thr-qalaa", "agent",
      `**${lease.id}** — the ${requester.name} asks the ${owner.name} to **${CAPABILITY_LABEL[lease.capability].toLowerCase()}** on ${describeScope(lease.scope)} for ${Math.round(lease.durationSec / 60)} min. ${lease.justification}${lease.stepUpRequired ? " (needs a human code after you accept)" : ""}`,
      {
        agentId: "agt-saqr",
        severity: "medium",
        quickReplies: [
          { label: `Accept ${lease.id}`, command: `accept ${lease.id}`, tone: "primary" },
          { label: `Decline ${lease.id}`, command: `decline ${lease.id}`, tone: "danger" },
        ],
      }
    );
  })().catch(() => undefined);
  return { ok: true, lease, created: true };
}

/** plain codes live only in memory (never persisted, never in GET) so server
 * internals like fastForward's autoApprove can exercise the real code path. */
function codeCache(): Map<ID, string> {
  return ((G as Record<string, unknown>).__qalaaStepUpCodes ??= new Map<ID, string>()) as Map<ID, string>;
}
export function stepUpCodeFor(leaseId: ID): string | undefined {
  return codeCache().get(leaseId);
}

/** generates + stores a fresh sha-256-hashed code, delivers it as a Saqr message; returns the plain code for server-internal callers only */
export function issueStepUp(leaseId: ID, by: string): { challenge: StepUpChallenge; code: string } | null {
  const l = lease(leaseId);
  if (!l) return null;
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const challenge: StepUpChallenge = {
    id: ids.stepUp(),
    leaseId: l.id,
    codeHash: createHash("sha256").update(code).digest("hex"),
    issuedAt: store.now(),
    expiresAt: iso(store.s.simNowMs + STEP_UP_TTL_SIM_SEC * 1000),
    attempts: 0,
  };
  store.s.stepUps.push(challenge);
  codeCache().set(l.id, code);
  store.markDirty();
  record("step-up-sent", { actor: by, leaseId: l.id, summary: `Human code sent to the ${entityName(l.ownerEntityId)} for ${l.id} — good for ${STEP_UP_TTL_SIM_SEC / 60} sim-min.` });
  void (async () => {
    const { sendMessage } = await import("../messaging/composer");
    sendMessage("thr-qalaa", "agent",
      `One-time code for **${l.id}** (${CAPABILITY_LABEL[l.capability].toLowerCase()} on ${describeScope(l.scope)}): **${code}**\nEnter it within ${STEP_UP_TTL_SIM_SEC / 60} sim-min. Reply \`code ${l.id} ${code}\` or POST /api/authority/leases/${l.id}/step-up.`,
      { agentId: "agt-saqr", severity: "high" }
    );
  })().catch(() => undefined);
  return { challenge, code };
}

export function accept(leaseId: ID, by: string): { ok: true; lease: AuthorityLease; stepUpCode?: string } | { ok: false; status: number; message: string } {
  const l = lease(leaseId);
  if (!l) return { ok: false, status: 404, message: "lease not found" };
  if (l.status !== "pending") return { ok: false, status: 409, message: `${l.id} is ${l.status}, not pending` };
  const rules = rulesFor(l.ownerEntityId);
  l.stepUpRequired = rules.stepUp.includes(l.capability);
  l.acceptedAt = store.now();
  l.acceptedBy = by;
  record("accepted", { actor: by, leaseId: l.id, requestingEntityId: l.requestingEntityId, ownerEntityId: l.ownerEntityId, capability: l.capability, summary: `The ${entityName(l.ownerEntityId)} said yes to ${l.id} (${CAPABILITY_LABEL[l.capability].toLowerCase()} on ${describeScope(l.scope)}).` });
  if (l.stepUpRequired) {
    l.status = "pending-step-up";
    const issued = issueStepUp(l.id, by);
    store.markDirty();
    emit("authority.updated", { lease: l }, `${l.id} accepted — human code outstanding`, "medium");
    return { ok: true, lease: l, stepUpCode: issued?.code };
  }
  activateInternal(l, by);
  emit("authority.updated", { lease: l }, `${l.id} active — ${CAPABILITY_LABEL[l.capability].toLowerCase()} on ${describeScope(l.scope)}`, "medium");
  return { ok: true, lease: l };
}

function activateInternal(l: AuthorityLease, by: string): void {
  l.status = "active";
  l.activatedAt = store.now();
  l.expiresAt = iso(store.s.simNowMs + l.durationSec * 1000);
  store.markDirty();
  record("activated", { actor: by, leaseId: l.id, requestingEntityId: l.requestingEntityId, ownerEntityId: l.ownerEntityId, capability: l.capability, target: describeScope(l.scope), summary: `${l.id} is live — ${CAPABILITY_LABEL[l.capability].toLowerCase()} on ${describeScope(l.scope)} for ${Math.round(l.durationSec / 60)} sim-min.` });
  resolveLeaseWaiters(l.id, "active");
}

export function activate(leaseId: ID, by: string): AuthorityLease | null {
  const l = lease(leaseId);
  if (!l) return null;
  if (l.status === "pending") {
    l.acceptedAt = store.now();
    l.acceptedBy = by;
  }
  if (!["pending", "pending-step-up"].includes(l.status)) return l;
  if (l.status === "pending-step-up" && l.stepUpRequired && !l.stepUpCompletedAt) return l;
  activateInternal(l, by);
  emit("authority.updated", { lease: l }, `${l.id} active`, "medium");
  return l;
}

export function completeStepUp(leaseId: ID, code: string, by: string): { ok: true; lease: AuthorityLease } | { ok: false; status: number; message: string } {
  const l = lease(leaseId);
  if (!l) return { ok: false, status: 404, message: "lease not found" };
  const challenge = store.s.stepUps.filter((c) => c.leaseId === l.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
  if (!challenge) return { ok: false, status: 404, message: `no challenge for ${l.id}` };
  if (challenge.consumedAt) return { ok: false, status: 409, message: "code already used" };
  const nowMs = store.s.simNowMs;
  if (new Date(challenge.expiresAt).getTime() <= nowMs || challenge.attempts >= STEP_UP_MAX_ATTEMPTS) {
    return { ok: false, status: 410, message: "challenge expired" };
  }
  const hash = createHash("sha256").update(code).digest("hex");
  if (hash !== challenge.codeHash) {
    challenge.attempts += 1;
    store.markDirty();
    record("step-up-failed", { actor: by, leaseId: l.id, summary: `Wrong code for ${l.id} (${challenge.attempts}/${STEP_UP_MAX_ATTEMPTS}).` });
    return { ok: false, status: 403, message: `wrong code (${challenge.attempts}/${STEP_UP_MAX_ATTEMPTS})` };
  }
  challenge.consumedAt = store.now();
  l.stepUpCompletedAt = store.now();
  record("step-up-passed", { actor: by, leaseId: l.id, summary: `Human code entered for ${l.id} — permission goes live.` });
  activateInternal(l, by);
  emit("authority.updated", { lease: l }, `${l.id} active — human code entered`, "medium");
  return { ok: true, lease: l };
}

export function decline(leaseId: ID, by: string, reason?: string): { ok: true; lease: AuthorityLease } | { ok: false; status: number; message: string } {
  const l = lease(leaseId);
  if (!l) return { ok: false, status: 404, message: "lease not found" };
  if (!["pending", "pending-step-up"].includes(l.status)) return { ok: false, status: 409, message: `${l.id} is ${l.status}` };
  l.status = "declined";
  l.declinedAt = store.now();
  store.markDirty();
  record("declined", { actor: by, leaseId: l.id, requestingEntityId: l.requestingEntityId, ownerEntityId: l.ownerEntityId, capability: l.capability, summary: `The ${entityName(l.ownerEntityId)} said no to ${l.id}.${reason ? ` ${reason}` : ""}` });
  emit("authority.updated", { lease: l }, `${l.id} declined`, "medium");
  resolveLeaseWaiters(l.id, "refused");
  return { ok: true, lease: l };
}

export function revoke(leaseId: ID, by: string, reason?: string): { ok: true; lease: AuthorityLease } | { ok: false; status: number; message: string } {
  const l = lease(leaseId);
  if (!l) return { ok: false, status: 404, message: "lease not found" };
  if (["revoked", "declined", "expired"].includes(l.status)) return { ok: false, status: 409, message: `${l.id} already ${l.status}` };
  l.status = "revoked";
  l.revokedAt = store.now();
  l.revokedBy = by;
  if (reason) l.revokeReason = reason;
  store.markDirty();
  record("revoked", { actor: by, leaseId: l.id, requestingEntityId: l.requestingEntityId, ownerEntityId: l.ownerEntityId, capability: l.capability, target: describeScope(l.scope), summary: `The ${entityName(l.ownerEntityId)} took ${l.id} back.${reason ? ` ${reason}` : ""}` });
  emit("authority.updated", { lease: l }, `${l.id} revoked — power cut`, "high");
  resolveLeaseWaiters(l.id, "refused");
  return { ok: true, lease: l };
}

/* ── waiters for the tool gate (like waitForDecision) ── */

type LeaseWaiter = { resolve: (outcome: "active" | "refused") => void; deadlineMs: number };
function leaseWaiters(): Map<ID, LeaseWaiter> {
  return ((G as Record<string, unknown>).__qalaaLeaseWaiters ??= new Map<ID, LeaseWaiter>()) as Map<ID, LeaseWaiter>;
}
export function waitForLease(leaseId: ID, simSec: number): Promise<"active" | "refused"> {
  return new Promise((resolve) => leaseWaiters().set(leaseId, { resolve, deadlineMs: store.s.simNowMs + simSec * 1000 }));
}
function resolveLeaseWaiters(leaseId: ID, outcome: "active" | "refused"): void {
  const w = leaseWaiters().get(leaseId);
  if (w) {
    w.resolve(outcome);
    leaseWaiters().delete(leaseId);
  }
}

/** sim-clock expiry: leases past expiresAt flip; stale challenges die; lease waiters time out. */
export function tickAuthority(): void {
  const nowMs = store.s.simNowMs;
  for (const l of store.s.leases) {
    if (l.status === "active" && l.expiresAt && new Date(l.expiresAt).getTime() <= nowMs) {
      l.status = "expired";
      record("expired", { actor: "qalaa", leaseId: l.id, requestingEntityId: l.requestingEntityId, ownerEntityId: l.ownerEntityId, capability: l.capability, target: describeScope(l.scope), summary: `${l.id} ran out of time.` });
      emit("authority.updated", { lease: l }, `${l.id} expired`, "low");
      resolveLeaseWaiters(l.id, "refused");
    }
  }
  for (const [id, w] of [...leaseWaiters()]) {
    if (nowMs >= w.deadlineMs) {
      w.resolve("refused");
      leaseWaiters().delete(id);
    }
  }
}

/* ─────────────────────────── path / drill / reset / suggest ─────────────────────────── */

export function pathFor(leaseId: ID): AuthorityPath | null {
  const l = lease(leaseId);
  if (!l) return null;
  const requester = entityName(l.requestingEntityId);
  const owner = entityName(l.ownerEntityId);
  const agent = l.agentId ? store.agent(l.agentId) : undefined;
  const recs = store.s.records.filter((r) => r.leaseId === l.id);
  const nodes: AuthorityPathNode[] = [
    { id: `e-${l.requestingEntityId}`, kind: "entity", label: requester, sublabel: "asks", status: "done", at: l.requestedAt },
  ];
  if (agent) nodes.push({ id: `a-${agent.id}`, kind: "agent", label: agent.name, sublabel: "will act", status: "done" });
  nodes.push({ id: `e-${l.ownerEntityId}`, kind: "entity", label: owner, sublabel: "owns the systems", status: l.acceptedAt ? "done" : l.status === "declined" ? "refused" : "current", at: l.acceptedAt });
  if (l.stepUpRequired) nodes.push({ id: "s-stepup", kind: "state", label: "Human code", sublabel: "one-time step-up", status: l.stepUpCompletedAt ? "done" : l.status === "pending-step-up" ? "current" : "todo", at: l.stepUpCompletedAt });
  nodes.push({
    id: "s-status", kind: "state",
    label: l.status === "active" ? "Active" : l.status === "revoked" ? "Revoked" : l.status === "expired" ? "Expired" : l.status === "declined" ? "Declined" : "Waiting",
    sublabel: `${CAPABILITY_LABEL[l.capability]} on ${describeScope(l.scope)}`,
    status: l.status === "active" ? "current" : ["revoked", "expired", "declined"].includes(l.status) ? "refused" : "todo",
    at: l.activatedAt ?? l.revokedAt ?? l.declinedAt,
  });
  for (const r of recs.slice(-8)) {
    nodes.push({ id: `r-${r.id}`, kind: "record", label: r.kind, sublabel: r.summary, status: r.kind === "refused" ? "refused" : "done", at: r.at });
  }
  const edges: AuthorityPath["edges"] = [];
  for (let i = 0; i + 1 < nodes.length; i++) edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
  return { leaseId: l.id, nodes, edges };
}

/** The demo's one door: the response entity's agent wants to contain this system. Who owns it is read from the system itself. */
export const DEMO = { requestingEntityId: "ent-response", capability: "contain" as Capability, serverId: "srv-dataset-worker-02" };

function demoServer(): Server | undefined {
  return store.server(DEMO.serverId);
}

export function demoLease(): AuthorityLease | undefined {
  const ownerEntityId = demoServer()?.ownerEntityId;
  if (!ownerEntityId) return undefined;
  return store.s.leases
    .filter((l) => l.requestingEntityId === DEMO.requestingEntityId && l.ownerEntityId === ownerEntityId && l.capability === DEMO.capability && l.scope.serverIds?.includes(DEMO.serverId))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
}

/** GET /api/authority/step — plain-language guidance for the demo lease. */
export function drillState(): DrillState {
  const srv = demoServer();
  const system: DrillState["system"] = {
    serverId: DEMO.serverId,
    hostname: srv?.hostname ?? DEMO.serverId,
    ownerEntityId: srv?.ownerEntityId,
    dataClasses: srv?.dataClasses ?? [],
  };
  if (!srv?.ownerEntityId) {
    return { step: "onboard", title: "This system is not under Qalaa yet", next: `Say who owns ${system.hostname} and what data lives on it. Until then, nobody can grant anything.`, system };
  }
  const l = demoLease();
  const owner = entityName(srv.ownerEntityId);
  if (!l) return { step: "no-permission", title: "No permission yet", next: `Ask the ${owner} to contain ${system.hostname}.`, system };
  if (l.status === "pending") return { step: "asked", title: "Asked", next: `Next: the ${owner} decides.`, leaseId: l.id, system };
  if (l.status === "pending-step-up") return { step: "code-needed", title: "Owner said yes — human code needed", next: "Next: a person enters the one-time code from Messages.", leaseId: l.id, system };
  if (l.status === "declined") return { step: "asked", title: "Declined", next: `The ${owner} said no — ask again with a better reason.`, leaseId: l.id, system };
  if (l.status === "revoked") return { step: "revoked", title: "Taken back", next: `The ${owner} revoked it — the agent is powerless again.`, leaseId: l.id, system };
  if (l.status === "expired") return { step: "expired", title: "Expired", next: "The window closed — ask for a new one.", leaseId: l.id, system };
  // active
  const acted = store.s.records.some((r) => r.leaseId === l.id && r.kind === "allowed");
  if (acted) return { step: "acted", title: "Acted", next: `The agent used it. The ${owner} can revoke any time.`, leaseId: l.id, system };
  return { step: "allowed", title: "Live permission", next: "Next: the agent may act — watch the record.", leaseId: l.id, system };
}

/**
 * POST /api/authority/onboard — put a system under an owner. From this moment
 * every touch on it by another entity's agent needs that owner's permission.
 * Any permission scoped to the system under a previous owner is closed.
 */
export function onboardSystem(input: OnboardInput, by: string): { ok: true; server: Server; record: DecisionRecord } | { ok: false; code: "NOT_FOUND" | "NOT_AN_OWNER"; message: string } {
  const srv = store.server(input.serverId);
  if (!srv) return { ok: false, code: "NOT_FOUND", message: `No system called ${input.serverId}.` };
  const owner = entity(input.ownerEntityId);
  if (!owner || owner.operatesAgents) return { ok: false, code: "NOT_AN_OWNER", message: `${entityName(input.ownerEntityId)} cannot own systems here.` };
  const previous = srv.ownerEntityId;
  srv.ownerEntityId = owner.id;
  srv.dataClasses = input.dataClasses ?? srv.dataClasses ?? [];
  if (previous && previous !== owner.id) {
    for (const l of store.s.leases) {
      if (l.ownerEntityId === previous && l.scope.serverIds?.includes(srv.id) && (l.status === "pending" || l.status === "pending-step-up" || l.status === "active")) {
        l.status = "revoked";
        l.revokedAt = store.now();
        l.revokedBy = by;
        resolveLeaseWaiters(l.id, "refused");
      }
    }
  }
  const classes = srv.dataClasses.length ? srv.dataClasses.map((c) => DATA_CLASS_LABEL[c].toLowerCase()).join(", ") : "no sensitive data";
  const rec = record("onboarded", {
    actor: by,
    actorName: owner.shortName,
    ownerEntityId: owner.id,
    target: srv.id,
    summary: `${srv.hostname} is now under the ${owner.name}. It holds ${classes}. Nothing may touch it without their say.`,
    detail: { previousOwnerEntityId: previous, dataClasses: srv.dataClasses },
  });
  store.markDirty();
  emit("authority.updated", { onboarded: srv.id, ownerEntityId: owner.id }, rec.summary, "medium");
  return { ok: true, server: srv, record: rec };
}

/**
 * POST /api/authority/reset — leases/records/challenges back to seed, keeps entities+rules.
 * With `fromOnboarding`, the demo system is also taken out from under its owner so the
 * story starts where a real customer starts: putting a system under Qalaa.
 */
export function resetAuthority(nowIso: string, opts: { fromOnboarding?: boolean } = {}): { ok: true } {
  store.s.leases = seedObserveLeases(nowIso);
  store.s.stepUps = [];
  store.s.records = [];
  for (const w of [...leaseWaiters()]) resolveLeaseWaiters(w[0], "refused");
  codeCache().clear();
  const srv = demoServer();
  if (srv) {
    if (opts.fromOnboarding) delete srv.ownerEntityId;
    else srv.ownerEntityId = ownerForServer(srv);
  }
  store.markDirty();
  emit("authority.updated", { reset: true }, "authority state reset to seed", "medium");
  return { ok: true };
}

/** POST /api/authority/suggest — smallest permission that fits the owner's rules. Deterministic; the model may only draft wording. */
export function suggest(input: { incidentId?: ID; agentId?: ID; capability?: Capability; serverId?: ID }): PermissionSuggestion | { error: string } {
  let capability = input.capability ?? "observe";
  let serverId = input.serverId;
  const incidentId = input.incidentId;
  if (incidentId) {
    const t = store.threat(incidentId);
    if (!t) return { error: `incident ${incidentId} not found` };
    serverId = serverId ?? t.targetServerIds[0];
    // crude deterministic mapping: live threats need contain
    if (!input.capability) capability = "contain";
  }
  const srv = serverId ? store.server(serverId) : undefined;
  const ownerEntityId = srv?.ownerEntityId ?? "ent-data";
  const agentId = input.agentId;
  const requestingEntityId = agentId ? (store.agent(agentId)?.entityId ?? "ent-response") : "ent-response";
  const rules = rulesFor(ownerEntityId);
  const scope: AuthorityScope = srv ? { serverIds: [srv.id] } : {};
  const durationSec = Math.min(3600, rules.maxDurationSec || 3600);
  const terms = [
    { label: `Capability: ${CAPABILITY_LABEL[capability]}`, allowed: rules.allowed.includes(capability), why: rules.allowed.includes(capability) ? `the ${entityName(ownerEntityId)} lends it` : `the ${entityName(ownerEntityId)} never lends this` },
    { label: `Scope: ${describeScope(scope)}`, allowed: rules.allowed.includes(capability) ? neverSharedHit(scope, ownerEntityId) === null || !DATA_READ_CAPS.includes(capability) : false, why: srv ? `narrowest possible — just ${srv.hostname}` : "whole estate" },
    { label: `Time: ${Math.round(durationSec / 60)} min`, allowed: durationSec <= (rules.maxDurationSec || Infinity), why: `the ${entityName(ownerEntityId)} caps at ${Math.round(rules.maxDurationSec / 60)} min` },
  ];
  if (capability === "observe" || capability === "data") {
    const hit = srv ? srv.dataClasses?.find((d) => rules.neverShared.includes(d)) : neverSharedHit(scope, ownerEntityId);
    if (hit) terms.push({ label: `Never shared: ${DATA_CLASS_LABEL[hit]}`, allowed: false, why: `the ${entityName(ownerEntityId)} never shares ${DATA_CLASS_LABEL[hit].toLowerCase()}` });
  }
  return {
    requestingEntityId,
    ownerEntityId,
    agentId,
    capability,
    scope,
    durationSec,
    justification: incidentId ? `Incident ${incidentId}: ${CAPABILITY_LABEL[capability].toLowerCase()} on ${srv?.hostname ?? "the estate"}` : `${CAPABILITY_LABEL[capability].toLowerCase()} on ${srv?.hostname ?? "the estate"}`,
    incidentId,
    terms,
    source: "rules",
  };
}
