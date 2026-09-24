/**
 * Trace builder (SPEC §5): observe → reason → plan → per tool:
 * policy → (approval) → tool → outcome; message spans when texting.
 */
import type { Agent, ID, Severity, Trace, TraceSpan, TraceSpanKind, TraceVerdict } from "@/lib/types";
import { bus } from "../bus";
import { ids } from "../ids";
import { store } from "../store";
import { RISK_WEIGHT, SEVERITY_WEIGHT, toolSpec } from "../agents/tools";
import type { ToolName } from "@/lib/types";

export interface TraceCtx {
  threatId?: ID;
  migrationId?: ID;
  severity?: Severity;
}

export function startTrace(agent: Agent, intent: string, ctx: TraceCtx = {}): Trace {
  const trace: Trace = {
    id: ids.trace(),
    agentId: agent.id,
    threatId: ctx.threatId,
    migrationId: ctx.migrationId,
    intent,
    spans: [],
    verdict: "in-progress",
    riskScore: 0,
    startedAt: store.now(),
  };
  store.s.traces.push(trace);
  store.markDirty();
  bus.emit("trace.started", { trace }, { agentId: agent.id, summary: `${agent.name} — ${intent}`, href: `/governance?trace=${trace.id}` });
  return trace;
}

export function addSpan(
  trace: Trace,
  kind: TraceSpanKind,
  label: string,
  extra: Partial<TraceSpan> = {}
): TraceSpan {
  const span: TraceSpan = {
    id: ids.span(),
    kind,
    label,
    startedAt: store.now(),
    status: "ok",
    ...extra,
  };
  trace.spans.push(span);
  store.markDirty();
  bus.emit("trace.span", { traceId: trace.id, span }, { agentId: trace.agentId, summary: `${label}`, href: `/governance?trace=${trace.id}` });
  return span;
}

export function endSpan(span: TraceSpan, status: TraceSpan["status"] = "ok", output?: unknown): void {
  span.endedAt = store.now();
  span.status = status;
  if (output !== undefined) span.output = output;
  store.markDirty();
}

export function endTrace(trace: Trace, verdict: TraceVerdict): void {
  trace.verdict = verdict;
  trace.endedAt = store.now();
  // riskScore = max tool risk weight × severity weight
  const maxRisk = trace.spans.reduce((m, s) => (s.toolName ? Math.max(m, RISK_WEIGHT[toolSpec(s.toolName).risk]) : m), 0);
  const threat = trace.threatId ? store.threat(trace.threatId) : undefined;
  const sevW = SEVERITY_WEIGHT[threat?.severity ?? "medium"];
  trace.riskScore = Math.round(Math.min(100, maxRisk * sevW + (sevW >= 0.8 ? 20 : 0)));
  const agent = store.agent(trace.agentId);
  if (agent) agent.metrics.actionsTaken += trace.spans.filter((s) => s.kind === "tool").length;
  store.markDirty();
  bus.emit("trace.completed", { trace }, { agentId: trace.agentId, summary: `trace ${trace.id} → ${verdict}`, href: `/governance?trace=${trace.id}` });
}

/** Record a policy evaluation span for a tool call. */
export function policySpan(trace: Trace, tool: ToolName, evaluations: TraceSpan["policyEvaluations"], effect: string): TraceSpan {
  return addSpan(trace, "policy", `policy → ${tool}`, {
    toolName: tool,
    policyEvaluations: evaluations,
    output: { effect },
  });
}
