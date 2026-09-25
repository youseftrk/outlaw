/** Channel-neutral view of an outbound message; every adapter renders from this. */
import type { ID, ISODate, Message, MessageKind, QuickReply, Severity } from "@/lib/types";
import { store } from "../store";

export interface DeliveryEnvelope {
  id: ID;
  threadId: ID;
  from: Message["from"];
  agentName: string;
  kind: MessageKind;
  severity: Severity;
  text: string;
  quickReplies: QuickReply[];
  /** app-relative deep link, e.g. "/messages?thread=thr-saqr" */
  href: string;
  sentAt: ISODate;
}

export function toEnvelope(msg: Message): DeliveryEnvelope {
  const agentName = msg.agentId ? store.agent(msg.agentId)?.name ?? "Qalaa" : "Qalaa";
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: msg.from,
    agentName,
    kind: msg.kind,
    severity: msg.severity ?? "info",
    text: msg.text,
    quickReplies: msg.quickReplies ?? [],
    href: `/messages?thread=${msg.threadId}`,
    sentAt: msg.sentAt,
  };
}
