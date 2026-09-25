/**
 * Approval lifecycle (SPEC §5): created on require-approval; Saqr texts
 * the operator; decision resumes or denies the waiting tool call; expiry
 * 10 sim-min → expired.
 */
import type { Agent, Approval, ApprovalStatus, ID, ToolName } from "@/lib/types";
import { bus } from "../bus";
import { ids } from "../ids";
import { store } from "../store";
import { waiters } from "../shared";

export const APPROVAL_TTL_SIM_SEC = 600;

export function createApproval(opts: {
  traceId: ID;
  agent: Agent;
  toolName: ToolName;
  summary: string;
  risk: Approval["risk"];
  targets: string[];
  threatId?: ID;
  migrationId?: ID;
}): Approval {
  const approval: Approval = {
    id: ids.approval(),
    traceId: opts.traceId,
    agentId: opts.agent.id,
    toolName: opts.toolName,
    summary: opts.summary,
    risk: opts.risk,
    targets: opts.targets,
    status: "pending",
    requestedAt: store.now(),
    threatId: opts.threatId,
    migrationId: opts.migrationId,
  };
  store.s.approvals.push(approval);
  opts.agent.metrics.approvalsRequested += 1;
  store.markDirty();
  bus.emit("approval.requested", { approval }, {
    agentId: opts.agent.id,
    severity: "medium",
    summary: `${opts.agent.name} requests approval: ${opts.toolName} (${approval.id})`,
    href: "/governance",
  });
  return approval;
}

export function waitForDecision(id: ID): Promise<ApprovalStatus> {
  return new Promise((resolve) => waiters().set(id, resolve));
}

export function decide(id: ID, decision: "approve" | "reject", decidedBy: Approval["decidedBy"] = "operator"): Approval | null {
  const a = store.approval(id);
  if (!a || a.status !== "pending") return a ?? null;
  a.status = decision === "approve" ? "approved" : "rejected";
  a.decidedAt = store.now();
  a.decidedBy = decidedBy;
  store.markDirty();
  bus.emit("approval.decided", { approval: a }, {
    agentId: a.agentId,
    summary: `approval ${a.id} ${a.status}`,
    href: "/governance",
  });
  waiters().get(a.id)?.(a.status);
  waiters().delete(a.id);
  return a;
}

/** Tick: expire pending approvals older than 10 sim-min. */
export function tickApprovals(): void {
  const nowMs = store.s.simNowMs;
  for (const a of store.s.approvals) {
    if (a.status === "pending" && nowMs - new Date(a.requestedAt).getTime() > APPROVAL_TTL_SIM_SEC * 1000) {
      a.status = "expired";
      a.decidedAt = store.now();
      a.decidedBy = "auto-policy";
      bus.emit("approval.decided", { approval: a }, { agentId: a.agentId, summary: `approval ${a.id} expired`, href: "/governance" });
      waiters().get(a.id)?.("expired");
      waiters().delete(a.id);
      store.markDirty();
    }
  }
}
