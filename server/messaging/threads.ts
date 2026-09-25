/** Thread helpers (SPEC §8): one thread per agent + thr-qalaa system. */
import type { ID, Message, Thread } from "@/lib/types";
import { bus } from "../bus";
import { store } from "../store";

export function listThreads(): Thread[] {
  return [...store.s.threads].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function threadMessages(threadId: ID, limit = 100): Message[] {
  return store.s.messages.filter((m) => m.threadId === threadId).slice(-limit);
}

export function markRead(threadId: ID): number {
  let n = 0;
  for (const m of store.s.messages) {
    if (m.threadId === threadId && m.from === "agent" && !m.readAt) {
      m.readAt = store.now();
      n++;
    }
  }
  const t = store.thread(threadId);
  if (t) t.unread = 0;
  if (n) {
    store.markDirty();
    bus.emit("message.updated", { threadId, readCount: n }, { summary: `read ${n} message(s) in ${threadId}`, href: "/messages" });
  }
  return n;
}
