/**
 * Policy evaluation (SPEC §5): policies sorted by priority; first matching
 * deny wins; else first matching require-approval; else allow. Every
 * evaluation (matched or not) is recorded. Autonomy caps applied first.
 */
import type {
  Agent,
  Policy,
  PolicyEffect,
  PolicyEvaluation,
  PolicyMatch,
  Server,
  Severity,
  ToolName,
} from "@/lib/types";
import { isMutating, toolSpec } from "../agents/tools";
import { store } from "../store";

export interface EvalCtx {
  server?: Server;
  severity?: Severity;
  /** for migrate_workload: environment of the target */
  targetEnv?: string;
}

function matchPolicy(p: Policy, agent: Agent, tool: ToolName, ctx: EvalCtx): { matched: boolean; reason: string } {
  const m: PolicyMatch = p.match;
  const spec = toolSpec(tool);
  const reasons: string[] = [];

  if (m.tools?.length && !m.tools.includes(tool)) {
    return { matched: false, reason: `tool ${tool} not in [${m.tools.join(", ")}]` };
  }
  if (m.tools?.length) reasons.push(`tool=${tool}`);

  if (m.risk?.length && !m.risk.includes(spec.risk)) {
    return { matched: false, reason: `risk ${spec.risk} not in [${m.risk.join(", ")}]` };
  }
  if (m.risk?.length) reasons.push(`risk=${spec.risk}`);

  if (m.minSeverity) {
    const order = ["info", "low", "medium", "high", "critical"];
    const sev = ctx.severity ?? "medium";
    if (order.indexOf(sev) < order.indexOf(m.minSeverity)) {
      return { matched: false, reason: `severity ${sev} below ${m.minSeverity}` };
    }
    reasons.push(`severity≥${m.minSeverity}`);
  }

  if (m.serverTags?.length) {
    const tags = new Set(ctx.server ? [...ctx.server.tags, `role:${ctx.server.role}`] : []);
    if (!m.serverTags.some((t) => tags.has(t))) {
      return { matched: false, reason: `server tags don't include [${m.serverTags.join(", ")}]` };
    }
    reasons.push("server-tag match");
  }

  if (m.environments?.length) {
    const env = ctx.server?.env ?? ctx.targetEnv;
    if (!env || !m.environments.includes(env as never)) {
      return { matched: false, reason: `env ${env ?? "?"} not in [${m.environments.join(", ")}]` };
    }
    reasons.push(`env=${env}`);
  }

  if (m.agentRoles?.length && !m.agentRoles.includes(agent.role)) {
    return { matched: false, reason: `agent role ${agent.role} not in [${m.agentRoles.join(", ")}]` };
  }
  if (m.agentRoles?.length) reasons.push(`role=${agent.role}`);

  return { matched: true, reason: reasons.join("; ") || "default" };
}

/** Special-case: prod→sandbox migration deny needs the target env. */
function effectiveEffect(p: Policy, tool: ToolName, ctx: EvalCtx): PolicyEffect {
  if (p.id === "pol-02" && tool === "migrate_workload") {
    return ctx.targetEnv === "sandbox" ? "deny" : "allow";
  }
  return p.effect;
}

export function evaluate(agent: Agent, tool: ToolName, ctx: EvalCtx = {}): { effect: PolicyEffect; evaluations: PolicyEvaluation[] } {
  const spec = toolSpec(tool);
  const evaluations: PolicyEvaluation[] = [];

  // autonomy caps
  if (agent.autonomy === "observe" && isMutating(tool)) {
    evaluations.push({ policyId: "cap", policyName: "Autonomy cap: observe", effect: "deny", matched: true, reason: "agent is observe-only" });
    return { effect: "deny", evaluations };
  }
  if (agent.autonomy === "recommend" && isMutating(tool)) {
    evaluations.push({ policyId: "cap", policyName: "Autonomy cap: recommend", effect: "require-approval", matched: true, reason: "agent may only recommend" });
    return { effect: "require-approval", evaluations };
  }
  if (agent.autonomy === "act-with-approval" && ["medium", "high", "destructive"].includes(spec.risk)) {
    evaluations.push({ policyId: "cap", policyName: "Autonomy cap: act-with-approval", effect: "require-approval", matched: true, reason: `risk ${spec.risk} requires approval` });
    return { effect: "require-approval", evaluations };
  }
  // autonomous → policies decide (cap recorded as non-matching context)
  evaluations.push({ policyId: "cap", policyName: `Autonomy: ${agent.autonomy}`, effect: "allow", matched: false, reason: "no cap applied" });

  const sorted = [...store.s.policies].sort((a, b) => a.priority - b.priority);
  let firstDeny: Policy | undefined;
  let firstApproval: Policy | undefined;

  for (const p of sorted) {
    const { matched, reason } = matchPolicy(p, agent, tool, ctx);
    const effect = matched ? effectiveEffect(p, tool, ctx) : p.effect;
    evaluations.push({ policyId: p.id, policyName: p.name, effect, matched, reason });
    if (matched) {
      p.hits += 1;
      if (effect === "deny" && !firstDeny) firstDeny = p;
      else if (effect === "require-approval" && !firstApproval) firstApproval = p;
    }
  }
  store.markDirty();

  if (firstDeny) return { effect: "deny", evaluations };
  if (firstApproval) return { effect: "require-approval", evaluations };
  return { effect: "allow", evaluations };
}
