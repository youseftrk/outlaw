/**
 * Message composition (SPEC §8): alerts, approval requests with quick
 * replies, reports, attachments linking threats/servers/traces.
 */
import type { Agent, Approval, Attachment, ID, Message, MessageKind, QuickReply, Severity, Threat } from "@/lib/types";
import { bus } from "../bus";
import { ids } from "../ids";
import { store } from "../store";

export interface SendOpts {
  kind?: MessageKind;
  severity?: Severity;
  attachments?: Attachment[];
  quickReplies?: QuickReply[];
  approvalId?: ID;
  threatId?: ID;
  traceId?: ID;
  text?: string;
}

export function agentThreadId(agent: Agent): string {
  return `thr-${agent.name.toLowerCase()}`;
}

export function sendMessage(threadId: string, from: Message["from"], text: string, opts: SendOpts & { agentId?: ID } = {}): Message {
  const msg: Message = {
    id: ids.message(),
    threadId,
    from,
    agentId: opts.agentId,
    kind: opts.kind ?? "text",
    text,
    severity: opts.severity,
    attachments: opts.attachments,
    quickReplies: opts.quickReplies,
    approvalId: opts.approvalId,
    threatId: opts.threatId,
    traceId: opts.traceId,
    sentAt: store.now(),
    deliveredAt: store.now(),
  };
  store.s.messages.push(msg);
  const thread = store.thread(threadId);
  if (thread) {
    thread.lastMessageAt = msg.sentAt;
    thread.lastPreview = text.slice(0, 120);
    if (from === "agent") thread.unread += 1;
  }
  store.markDirty();
  bus.emit("message.sent", { message: msg }, {
    agentId: opts.agentId,
    severity: opts.severity,
    summary: `${opts.agentId ? store.agent(opts.agentId)?.name ?? "system" : "system"}: ${text.slice(0, 80)}`,
    href: `/messages`,
  });
  return msg;
}

export function agentSay(agent: Agent, text: string, opts: SendOpts = {}): Message {
  return sendMessage(agentThreadId(agent), "agent", text, { ...opts, agentId: agent.id });
}

/** Cassidy texts the operator (goes to her thread). */
export function operatorSay(text: string, opts: SendOpts = {}): Message {
  const cassidy = store.agent("agt-cassidy")!;
  return agentSay(cassidy, text, opts);
}

export function notifyApprovalRequest(agent: Agent, approval: Approval): Message {
  const cassidy = store.agent("agt-cassidy")!;
  return agentSay(cassidy,
    `Need your call: ${agent.name} wants to run **${approval.toolName}** on ${approval.targets.join(", ") || "—"}. ${approval.summary}`,
    {
      kind: "approval-request",
      severity: "medium",
      approvalId: approval.id,
      threatId: approval.threatId,
      quickReplies: [
        { label: `Approve ${approval.id}`, command: `approve ${approval.id}`, tone: "primary" },
        { label: `Reject ${approval.id}`, command: `reject ${approval.id}`, tone: "danger" },
      ],
    }
  );
}

export function threatAlert(threat: Threat, text: string, agent?: Agent): Message {
  const cassidy = store.agent("agt-cassidy")!;
  return agentSay(agent ?? cassidy, text, {
    kind: "alert",
    severity: threat.severity,
    threatId: threat.id,
    attachments: [
      { type: "threat-card", refId: threat.id, title: threat.title, subtitle: `${threat.severity} · ${threat.status}` },
      ...threat.targetServerIds.slice(0, 2).map((sid) => ({
        type: "server-card" as const,
        refId: sid,
        title: store.server(sid)?.hostname ?? sid,
        subtitle: store.server(sid)?.role,
      })),
    ],
  });
}

export function threatResolved(threat: Threat, text: string): Message {
  const cassidy = store.agent("agt-cassidy")!;
  return agentSay(cassidy, text, {
    kind: "report",
    severity: "low",
    threatId: threat.id,
    attachments: [{ type: "threat-card", refId: threat.id, title: threat.title, subtitle: threat.status }],
  });
}

export function systemSay(text: string, opts: SendOpts = {}): Message {
  return sendMessage("thr-qalaa", "system", text, { kind: "system", ...opts });
}
