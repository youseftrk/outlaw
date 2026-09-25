/**
 * Typed event bus → QalaaEvent. Fan-out to SSE subscribers with replay
 * from the events ring buffer (?since=<eventId>).
 */
import type { EventType, QalaaEvent, Severity, ID } from "@/lib/types";
import { ids } from "./ids";
import { store } from "./store";
import { listeners } from "./shared";

export interface EmitOpts {
  agentId?: ID;
  severity?: Severity;
  /** one-line human description rendered directly by the live feed */
  summary?: string;
  /** deep link, e.g. "/threats/T-1042" */
  href?: string;
}

type Listener = (ev: QalaaEvent) => void;

export const bus = {
  emit<T>(type: EventType, payload: T, opts: EmitOpts = {}): QalaaEvent<T> {
    const ev: QalaaEvent<T> = {
      id: ids.event(),
      type,
      at: store.now(),
      agentId: opts.agentId,
      severity: opts.severity,
      summary: opts.summary,
      href: opts.href,
      payload,
    };
    store.pushEvent(ev as QalaaEvent);
    store.markDirty();
    for (const fn of listeners()) {
      try {
        fn(ev as QalaaEvent);
      } catch {
        /* listener errors must not break the emitter */
      }
    }
    return ev as QalaaEvent<T>;
  },

  subscribe(fn: Listener): () => void {
    listeners().add(fn);
    return () => listeners().delete(fn);
  },

  clientCount(): number {
    return listeners().size;
  },

  /** Events after the given event id (ring-buffer replay for ?since=). */
  replay(since?: string): QalaaEvent[] {
    const events = store.s.events;
    if (!since) return events.slice(-50);
    const idx = events.findIndex((e) => e.id === since);
    return idx === -1 ? events.slice(-50) : events.slice(idx + 1);
  },
};
