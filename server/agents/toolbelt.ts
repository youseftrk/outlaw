/**
 * Tool implementations (SPEC §2/§4). Every invocation goes through
 * governance first: policy span → (approval) → tool span → outcome.
 * Tools mutate world/store via the fleet adapter, emit events, and
 * return { ok, summary, evidence }.
 */
import type { Agent, ID, Severity, ToolName, Trace } from "@/lib/types";
import { bus } from "../bus";
import { store } from "../store";
import * as world from "../world/world";
import { evaluate } from "../governance/policy";
import { addSpan, endSpan, policySpan } from "../governance/traces";
import { createApproval, waitForDecision } from "../governance/approvals";
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
  const { effect, evaluations } = evaluate(agent, tool, { server, severity: ctx.severity, targetEnv: args.targetEnv });
  const polSpan = policySpan(trace, tool, evaluations, effect);
  endSpan(polSpan, effect === "deny" ? "denied" : "ok", { effect });

  if (effect === "deny") {
    agent.metrics.policyDenials += 1;
    return { ok: false, summary: `${tool} denied by policy` };
  }

  if (effect === "require-approval") {
    const approval = createApproval({
      traceId: trace.id,
      agent,
      toolName: tool,
      summary: `${agent.name} wants to ${tool} ${args.serverId ? `on ${server?.hostname ?? args.serverId}` : ""}`.trim(),
      risk: spec.risk,
      targets: [args.serverId, args.datasetId, args.tokenId, args.clusterId].filter(Boolean) as string[],
      threatId: ctx.severity ? trace.threatId : undefined,
      migrationId: trace.migrationId,
    });
    const apprSpan = addSpan(trace, "approval", `approval ${approval.id}`, { approvalId: approval.id, status: "pending" });
    // notify Cassidy's thread (composer import deferred to avoid cycle)
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
