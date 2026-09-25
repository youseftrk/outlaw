"use client";

/**
 * Live event stream (SSE from /api/events) shared across the app.
 * - `useLive()` gives connection state + a ring buffer of recent events.
 * - `useLiveEvent(types, handler)` subscribes to specific event types.
 * - SWR caches for entity lists are revalidated when matching events arrive,
 *   so pages stay fresh without polling.
 */
import * as React from "react";
import { useSWRConfig } from "swr";
import type { EventType, QalaaEvent } from "@/lib/types";

type ConnectionState = "connecting" | "live" | "reconnecting";

interface LiveContextValue {
  state: ConnectionState;
  events: QalaaEvent[];
  lastEventAt: string | null;
  subscribe: (types: EventType[] | "*", handler: (e: QalaaEvent) => void) => () => void;
}

const LiveContext = React.createContext<LiveContextValue | null>(null);

const RING = 300;

/** Which SWR keys to revalidate for each event type. */
const INVALIDATIONS: Partial<Record<EventType, string[]>> = {
  "threat.detected": ["/threats", "/bootstrap", "/insights"],
  "threat.updated": ["/threats", "/bootstrap", "/insights"],
  "agent.status": ["/agents", "/bootstrap"],
  "agent.action": ["/agents"],
  "trace.started": ["/governance/traces"],
  "trace.completed": ["/governance/traces", "/agents"],
  "approval.requested": ["/governance/approvals", "/bootstrap"],
  "approval.decided": ["/governance/approvals", "/bootstrap", "/governance/traces"],
  "message.sent": ["/messages/threads", "/bootstrap"],
  "message.updated": ["/messages/threads"],
  "server.updated": ["/fleet/servers", "/bootstrap"],
  "migration.updated": ["/fleet/migrations", "/bootstrap"],
  "policy.updated": ["/governance/policies", "/bootstrap"],
  "research.updated": ["/research/queries"],
  "range.step": ["/range"],
  "range.run": ["/range", "/bootstrap"],
  "insights.updated": ["/insights"],
};

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const { mutate } = useSWRConfig();
  const [state, setState] = React.useState<ConnectionState>("connecting");
  const [events, setEvents] = React.useState<QalaaEvent[]>([]);
  const [lastEventAt, setLastEventAt] = React.useState<string | null>(null);
  const handlers = React.useRef(new Set<{ types: EventType[] | "*"; fn: (e: QalaaEvent) => void }>());
  const lastId = React.useRef<string | null>(null);
  // Events arrive in bursts (one tick can emit dozens of spans). Buffer state updates and
  // coalesce SWR invalidations so the UI re-renders a few times a second, not per event.
  const buffer = React.useRef<QalaaEvent[]>([]);
  const pendingKeys = React.useRef(new Set<string>());
  const flushTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const flushEvents = () => {
      flushTimer.current = null;
      const batch = buffer.current;
      if (!batch.length) return;
      buffer.current = [];
      setLastEventAt(batch[batch.length - 1].at);
      setEvents((prev) => {
        const merged = prev.concat(batch);
        return merged.length > RING ? merged.slice(merged.length - RING) : merged;
      });
    };
    const flushInvalidations = () => {
      invalidateTimer.current = null;
      const keys = Array.from(pendingKeys.current);
      pendingKeys.current.clear();
      for (const key of keys) {
        void mutate((k) => typeof k === "string" && k.startsWith(key), undefined, { revalidate: true });
      }
    };

    const connect = () => {
      const url = lastId.current ? `/api/events?since=${encodeURIComponent(lastId.current)}` : "/api/events";
      es = new EventSource(url);
      es.onopen = () => setState("live");
      es.onerror = () => {
        setState("reconnecting");
        es?.close();
        if (!closed) retry = setTimeout(connect, 1500);
      };
      const onMessage = (raw: MessageEvent) => {
        let evt: QalaaEvent;
        try {
          evt = JSON.parse(raw.data) as QalaaEvent;
        } catch {
          return;
        }
        if (raw.lastEventId) lastId.current = raw.lastEventId;
        buffer.current.push(evt);
        if (!flushTimer.current) flushTimer.current = setTimeout(flushEvents, 250);
        for (const h of handlers.current) {
          if (h.types === "*" || h.types.includes(evt.type)) h.fn(evt);
        }
        const keys = INVALIDATIONS[evt.type];
        if (keys) {
          for (const key of keys) pendingKeys.current.add(key);
          if (!invalidateTimer.current) invalidateTimer.current = setTimeout(flushInvalidations, 1500);
        }
      };
      // The server names events by type; listen to all known types plus the default channel.
      es.onmessage = onMessage;
      for (const type of Object.keys(INVALIDATIONS).concat(["telemetry", "trace.span", "system"])) {
        es.addEventListener(type, onMessage as EventListener);
      }
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
      es?.close();
    };
  }, [mutate]);

  const subscribe = React.useCallback<LiveContextValue["subscribe"]>((types, fn) => {
    const entry = { types, fn };
    handlers.current.add(entry);
    return () => {
      handlers.current.delete(entry);
    };
  }, []);

  const value = React.useMemo(() => ({ state, events, lastEventAt, subscribe }), [state, events, lastEventAt, subscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const ctx = React.useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside <LiveProvider>");
  return ctx;
}

export function useLiveEvent(types: EventType[] | "*", handler: (e: QalaaEvent) => void) {
  const { subscribe } = useLive();
  const onEvent = React.useEffectEvent(handler);
  React.useEffect(() => subscribe(types, (e) => onEvent(e)), [subscribe, types]);
}
