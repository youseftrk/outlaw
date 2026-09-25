/**
 * Tool implementations (SPEC §2/§4). Every invocation goes through
 * governance first: policy span → (approval) → tool span → outcome.
 * Tools mutate world/store via the fleet adapter, emit events, and
 * return { ok, summary, evidence }.
 */
import type { Agent, AuthorityScope, AuthorizeInput, Capability, ID, Severity, ToolName, Trace } from "@/lib/types";
import { TOOL_CAPABILITY, CAPABILITY_LABEL } from "@/lib/types";
import { bus } from "../bus";
import { store } from "../store";
import * as world from "../world/world";
import { evaluate } from "../governance/policy";
import { addSpan, endSpan, policySpan, projectRisk } from "../governance/traces";
import { createApproval, waitForDecision } from "../governance/approvals";
import { authorize, request as requestLease, waitForLease, record as recordDecision, describeScope, LEASE_WAIT_MAX_SIM_SEC, entityName, authorityTickActive, accept as acceptLease, completeStepUp, stepUpCodeFor } from "../authority/engine";
import { toolSpec } from "./tools";
import { adapterFor } from "../fleet/adapters";
import { refreshServerConformance } from "../fleet/conformance";
import { telemetryWindow } from "../telemetry";

export interface ToolArgs {
  serverId?: ID;
  tokenId?: ID;
  tokenIds?: ID[];
  accountId?: ID;
  datasetId?: ID;
  clusterId?: ID;
  ip?: string;
  secretKind?: string;
  processName?: string;
  workload?: string;
  targetEnv?: string;
  threatId?: ID;
  query?: string;
  text?: string;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  /** exact command/plan the adapter ran on the host, when a fleet adapter was involved */
  command?: string;
  evidence?: Record<string, unknown>;
}

/** Governance-gated tool execution. Returns result + whether it ran. */
export async function runTool(
  agent: Agent,
  tool: ToolName,
  args: ToolArgs,
  trace: Trace,
  ctx: { severity?: Severity } = {}
): Promise<ToolResult> {
  const spec = toolSpec(tool);
  const server = args.serverId ? store.server(args.serverId) : undefined;

  // authority gate (PIVOT §4.1): every protected call needs an ACTIVE lease
  // from the owning entity — checked before policy.
  const auth = await authorityFor(agent, tool, args, trace);
  if (auth) {
    if (!auth.allow) {
      const span = addSpan(trace, "policy", `authority → ${tool}`, {
        toolName: tool,
        input: args,
        status: "pending",
        output: { leaseId: auth.lease?.id, refusalCode: auth.code },
      });
      endSpan(span, "denied", { leaseId: auth.lease?.id, refusalCode: auth.code, checks: auth.checks });
      bus.emit("agent.action", { agentId: agent.id, tool, args, result: { ok: false, summary: auth.message }, leaseId: auth.lease?.id, refusalCode: auth.code }, {
        agentId: agent.id,
        severity: "medium",
        summary: `${agent.name} refused ${tool} — ${auth.code}`,
        href: "/permissions",
      });
      return { ok: false, summary: auth.message, evidence: { refusalCode: auth.code, leaseId: auth.lease?.id, checks: auth.checks } };
    }
    addSpan(trace, "policy", `authority → ${tool}`, {
      toolName: tool,
      status: "ok",
      output: { leaseId: auth.lease.id },
    });
  }

  const { effect, evaluations } = evaluate(agent, tool, { server, severity: ctx.severity, targetEnv: args.targetEnv });
  const polSpan = policySpan(trace, tool, evaluations, effect);
  endSpan(polSpan, effect === "deny" ? "denied" : "ok", { effect });

  if (effect === "deny") {
    agent.metrics.policyDenials += 1;
    return { ok: false, summary: `${tool} denied by policy` };
  }

  if (effect === "require-approval") {
    projectRisk(trace, tool);
    const explicitTargets = [args.serverId, args.datasetId, args.tokenId, args.clusterId].filter(Boolean) as string[];
    const threatTargets = trace.threatId ? (store.threat(trace.threatId)?.targetServerIds ?? []) : [];
    const approval = createApproval({
      traceId: trace.id,
      agent,
      toolName: tool,
      summary: `${agent.name} wants to ${tool} ${args.serverId ? `on ${server?.hostname ?? args.serverId}` : ""}`.trim(),
      risk: spec.risk,
      targets: explicitTargets.length ? explicitTargets : threatTargets,
      threatId: ctx.severity ? trace.threatId : undefined,
      migrationId: trace.migrationId,
    });
    const apprSpan = addSpan(trace, "approval", `approval ${approval.id}`, { approvalId: approval.id, status: "pending" });
    // notify Saqr's thread (composer import deferred to avoid cycle)
    const { notifyApprovalRequest } = await import("../messaging/composer");
    notifyApprovalRequest(agent, approval);
    const decision = await waitForDecision(approval.id);
    if (decision !== "approved") {
      endSpan(apprSpan, "denied", { decision });
      return { ok: false, summary: `${tool} ${decision} (approval ${approval.id})` };
    }
    endSpan(apprSpan, "ok", { decision });
  }

  const span = addSpan(trace, "tool", spec.label, { toolName: tool, input: args, status: "pending" });
  const result = await invoke(agent, tool, args, trace);
  endSpan(span, result.ok ? "ok" : "error", result);
  bus.emit("agent.action", { agentId: agent.id, tool, args, result }, {
    agentId: agent.id,
    severity: result.ok ? (spec.risk === "read" ? "low" : spec.risk === "destructive" ? "high" : "medium") : "high",
    summary: `${agent.name} · ${spec.label}${server ? ` on ${server.hostname}` : ""}`,
    href: server ? `/fleet?server=${server.id}` : `/agents/${agent.id}`,
  });
  return result;
}

/** The tool table — each mutates world/store and returns a result. */
async function invoke(agent: Agent, tool: ToolName, args: ToolArgs, trace: Trace): Promise<ToolResult> {
  const by = { agentId: agent.id, toolName: tool, traceId: trace.id };
  const w = store.s.world;
  switch (tool) {
    case "query_telemetry": {
      const windowSigs = telemetryWindow(300);
      return { ok: true, summary: `${windowSigs.length} signals in last 5 sim-min`, evidence: { count: windowSigs.length } };
    }
    case "scan_public_secrets": {
      const exposed = w.tokens.filter((t) => t.exposedInDatasetId && !t.revoked);
      for (const t of exposed) world.revealExposedToken(t.id);
      const dsNames = [...new Set(exposed.map((t) => t.exposedInDatasetId!))].map(
        (id) => w.datasets.find((d) => d.id === id)?.name ?? id
      );
      return {
        ok: true,
        summary: exposed.length
          ? `found ${exposed.length} exposed token(s) in ${dsNames.join(", ")}`
          : "no exposed tokens in public datasets",
        evidence: { tokenIds: exposed.map((t) => t.id), datasets: dsNames },
      };
    }
    case "audit_tokens": {
      const stale = w.tokens.filter((t) => !t.revoked && t.scope !== "read" && (!t.lastUsedAt || Date.parse(t.lastUsedAt) < store.s.simNowMs - 30 * 86400_000));
      const newAsn = w.tokens.filter((t) => !t.revoked && t.lastUsedFromASN);
      return { ok: true, summary: `${stale.length} stale write/admin tokens, ${newAsn.length} seen from new ASNs`, evidence: { stale: stale.length, newAsn: newAsn.length } };
    }
    case "revoke_token": {
      if (args.tokenIds?.length) {
        let n = 0;
        for (const id of args.tokenIds) if ((world.revokeToken(id, by)).ok) n++;
        return { ok: n > 0, summary: `revoked ${n} token(s)` };
      }
      if (args.tokenId) return world.revokeToken(args.tokenId, by);
      const r = world.revokeRevealedTokens(by);
      return { ok: r.ok, summary: r.summary };
    }
    case "rotate_credentials": {
      if (args.serverId) {
        return adapterFor(args.serverId).rotateSecret(args.serverId, "*", by);
      }
      const r = world.rotateSecret(args.secretKind ?? "cloud", by);
      return { ok: r.ok, summary: r.summary };
    }
    case "disable_account":
      return world.disableAccount(args.accountId ?? "", by);
    case "scan_dataset": {
      const ds = w.datasets.find((d) => d.id === args.datasetId || d.name === args.datasetId);
      if (!ds) return { ok: false, summary: `dataset ${args.datasetId} not found` };
      if (ds.malicious) {
        world.revealMaliciousDataset(ds.id);
        return { ok: true, summary: `${ds.name} is MALICIOUS — loader payload detected`, evidence: { datasetId: ds.id, malicious: true } };
      }
      return { ok: true, summary: `${ds.name} clean`, evidence: { datasetId: ds.id, malicious: false } };
    }
    case "quarantine_dataset":
      return world.quarantineDataset(args.datasetId ?? "", by);
    case "inspect_worker": {
      const wk = w.workers.find((x) => x.serverId === args.serverId);
      if (!wk) return { ok: false, summary: `no worker record for ${args.serverId}` };
      const findings: string[] = [];
      if (!wk.fileDisclosurePatched) findings.push("file-disclosure CVE unpatched");
      if (!wk.templateInjectionPatched) findings.push("template-injection CVE unpatched");
      if (wk.compromised) findings.push("anomalous process tree");
      for (const f of ["fileDisclosurePatched", "templateInjectionPatched"]) {
        world.revealServerFact(args.serverId!, f, wk[f as "fileDisclosurePatched" | "templateInjectionPatched"]);
      }
      return { ok: true, summary: findings.length ? findings.join("; ") : "worker clean", evidence: { findings } };
    }
    case "isolate_host": {
      return adapterFor(args.serverId).isolate(args.serverId!, by);
    }
    case "block_egress": {
      if (args.ip) {
        const r = world.blockEgress("", by, args.ip);
        return { ok: r.ok, summary: r.summary };
      }
      const r = world.blockEgress(args.serverId!, by);
      return { ok: r.ok, summary: r.summary };
    }
    case "cordon_cluster":
      return world.cordonCluster(args.clusterId ?? "", by);
    case "lock_registry":
      return world.lockRegistry(by);
    case "patch_service": {
      const r = await adapterFor(args.serverId).applyPatch(args.serverId!, "latest-known-cves", by);
      if (r.ok && args.serverId) {
        const srv = store.server(args.serverId);
        if (srv) refreshServerConformance(srv);
      }
      return r;
    }
    case "harden_sandbox":
      return world.hardenSandbox(by);
    case "kill_process":
      return { ok: true, summary: `killed ${args.processName ?? "suspicious process"} on ${store.server(args.serverId ?? "")?.hostname ?? args.serverId}` };
    case "rebuild_node": {
      const srv = store.server(args.serverId!);
      if (srv) srv.status = "rebuilding";
      const r = world.rebuildNode(args.serverId!, by);
      return { ok: r.ok, summary: r.summary };
    }
    case "snapshot_evidence":
      return adapterFor(args.serverId).snapshot(args.serverId ?? "");
    case "enrich_ioc":
      return { ok: true, summary: `enriched IOCs for ${args.threatId ?? "threat"}`, evidence: { threatId: args.threatId } };
    case "map_attack":
      return { ok: true, summary: "kill chain mapped", evidence: { threatId: args.threatId } };
    case "run_conformance": {
      const srv = store.server(args.serverId!);
      if (!srv) return { ok: false, summary: `server ${args.serverId} not found` };
      refreshServerConformance(srv);
      const fails = srv.checks.filter((c) => c.status === "fail").length;
      const warns = srv.checks.filter((c) => c.status === "warn").length;
      // reveal world facts conformance exposes (§3.2)
      const ww = w;
      if (ww.registry.serverId === srv.id) {
        world.revealServerFact(srv.id, "pluginInstallAllowed", ww.registry.pluginInstallAllowed);
      }
      const wk = ww.workers.find((x) => x.serverId === srv.id);
      if (wk) {
        world.revealServerFact(srv.id, "fileDisclosurePatched", wk.fileDisclosurePatched);
        world.revealServerFact(srv.id, "templateInjectionPatched", wk.templateInjectionPatched);
      }
      world.revealServerFact(srv.id, "egressAllowed", ww.network.egressAllowed[srv.id] ?? false);
      return { ok: true, summary: `${srv.hostname}: ${fails} fail, ${warns} warn → score ${srv.conformanceScore}`, evidence: { score: srv.conformanceScore, fails, warns } };
    }
    case "remediate_drift":
      return world.remediateConfig(args.serverId!, by);
    case "migrate_workload": {
      return adapterFor(args.serverId).migrate(args.serverId!, undefined, [args.workload ?? "workloads"]);
    }
    case "notify_human":
      return { ok: true, summary: "operator notified" };
    case "request_approval":
      return { ok: true, summary: "approval requested" };
    default:
      return { ok: false, summary: `unknown tool ${tool}` };
  }
}

/* ─────────────────────────── authority gate (PIVOT §4.1) ─────────────────────────── */

/** resolve the tool's target to an owner + narrow scope; null = not gated */
function authorityTarget(args: ToolArgs): { input: Pick<AuthorizeInput, "serverId" | "cluster" | "ownerEntityId">; scope: AuthorityScope } | null {
  if (args.serverId) {
    const srv = store.server(args.serverId);
    if (!srv) return { input: { serverId: args.serverId }, scope: { serverIds: [args.serverId] } };
    return { input: { serverId: srv.id }, scope: { serverIds: [srv.id] } };
  }
  if (args.clusterId) {
    const cl = store.s.world.clusters.find((c) => c.id === args.clusterId || c.name === args.clusterId);
    return { input: { cluster: cl?.name ?? args.clusterId }, scope: { clusters: [cl?.name ?? args.clusterId] } };
  }
  // estate-level resources (tokens, datasets, accounts, secrets, ips) — owned by the data authority, estate scope
  if (args.datasetId || args.tokenId || args.tokenIds?.length || args.accountId || args.secretKind || args.ip) {
    return { input: { ownerEntityId: "ent-data" }, scope: {} };
  }
  return null;
}

/** tool → capability → target. Returns null when the call isn't gated (no target / ownable target). */
async function authorityFor(
  agent: Agent,
  tool: ToolName,
  args: ToolArgs,
  trace: Trace
): Promise<{ allow: true; lease: import("@/lib/types").AuthorityLease } | { allow: false; code: import("@/lib/types").RefusalCode; message: string; lease?: import("@/lib/types").AuthorityLease; checks: import("@/lib/types").AuthorityCheck[] } | null> {
  const capability = TOOL_CAPABILITY[tool];
  if (!capability) return null;
  const target = authorityTarget(args);
  if (!target) return null;

  const input: AuthorizeInput = { actorId: agent.id, capability: capability as Capability, ...target.input };
  let auth = authorize(input);
  // an explicit operator command is itself the human grant — no UI round-trip needed
  const operatorInitiated = trace.intent.startsWith("operator:");

  if (!auth.allow && (auth.code === "AUTHORITY_REQUIRED" || (operatorInitiated && auth.code === "AUTHORITY_PENDING"))) {
    // create/reuse one pending request, then wait up to 10 sim-min for activation
    const req = requestLease({
      requestingEntityId: agent.entityId ?? "ent-response",
      ownerEntityId: auth.ownerEntityId ?? "ent-data",
      agentId: agent.id,
      capability: capability as Capability,
      scope: target.scope,
      justification: trace.threatId ? `Incident ${trace.threatId}: ${CAPABILITY_LABEL[capability as Capability].toLowerCase()} needed to work it.` : `${CAPABILITY_LABEL[capability as Capability].toLowerCase()} needed for routine work.`,
      incidentId: trace.threatId,
      durationSec: 3600,
    }, agent.id);
    if (req.ok) {
      if (operatorInitiated) {
        const a = acceptLease(req.lease.id, "operator");
        if (a.ok && a.stepUpCode) completeStepUp(req.lease.id, a.stepUpCode, "operator");
        else if (!a.ok) {
          const code = stepUpCodeFor(req.lease.id);
          if (code) completeStepUp(req.lease.id, code, "operator");
        }
        auth = authorize(input);
      } else if (req.created && !authorityTickActive) {
        const outcome = await waitForLease(req.lease.id, LEASE_WAIT_MAX_SIM_SEC);
        if (outcome === "active") auth = authorize(input);
        else auth = { allow: false, code: "AUTHORITY_PENDING", ownerEntityId: auth.ownerEntityId, lease: req.lease, message: `The ${entityName(req.lease.ownerEntityId)} didn't answer in time.`, checks: auth.checks };
      } else {
        auth = { allow: false, code: "AUTHORITY_PENDING", ownerEntityId: auth.ownerEntityId, lease: req.lease, message: `Request ${req.lease.id} is already waiting on the ${entityName(req.lease.ownerEntityId)}.`, checks: auth.checks };
      }
    } else {
      auth = { allow: false, code: req.code ?? "RULES_EXCEEDED", ownerEntityId: auth.ownerEntityId, message: req.message, checks: auth.checks };
    }
  }

  if (auth.allow) {
    recordDecision("allowed", {
      actor: agent.id,
      actorName: agent.name,
      leaseId: auth.lease.id,
      incidentId: trace.threatId,
      requestingEntityId: auth.lease.requestingEntityId,
      ownerEntityId: auth.ownerEntityId,
      capability: capability as Capability,
      target: `${tool} on ${describeScope(target.scope)}`,
      checks: auth.checks,
      summary: `${agent.name} ran ${tool} under ${auth.lease.id}.`,
    });
    return { allow: true, lease: auth.lease };
  }

  recordDecision("refused", {
    actor: agent.id,
    actorName: agent.name,
    leaseId: auth.lease?.id,
    incidentId: trace.threatId,
    requestingEntityId: agent.entityId ?? "ent-response",
    ownerEntityId: auth.ownerEntityId,
    capability: capability as Capability,
    target: `${tool} on ${describeScope(target.scope)}`,
    refusalCode: auth.code,
    checks: auth.checks,
    summary: `${agent.name} refused ${tool} — ${auth.code}: ${auth.message}`,
  });
  return { allow: false, code: auth.code, message: auth.message, lease: auth.lease, checks: auth.checks };
}
