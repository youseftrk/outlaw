/**
 * Shared mutable registries pinned on globalThis. Next/Turbopack loads
 * instrumentation and route handlers in separate module contexts — module
 * singletons alone would diverge. Anything that must be process-unique
 * (state, secrets, SSE listeners, approval waiters, id counters, the tick
 * timer) lives here.
 */
import type { OutlawEvent, ApprovalStatus, ID } from "@/lib/types";
import type { OutlawState, OutlawSecrets } from "./store";

export interface OutlawGlobal {
  __outlawState?: OutlawState | null;
  __outlawSecrets?: OutlawSecrets;
  __outlawListeners?: Set<(ev: OutlawEvent) => void>;
  __outlawWaiters?: Map<ID, (d: ApprovalStatus) => void>;
  __outlawCounters?: Map<string, number>;
  __outlawTimer?: unknown;
  __outlawRt?: unknown;
  __outlawRangeAttempts?: Map<string, Map<number, number>>;
}

export const G = globalThis as unknown as OutlawGlobal;

export function counters(): Map<string, number> {
  return (G.__outlawCounters ??= new Map());
}
export function listeners(): Set<(ev: OutlawEvent) => void> {
  return (G.__outlawListeners ??= new Set());
}
export function waiters(): Map<ID, (d: ApprovalStatus) => void> {
  return (G.__outlawWaiters ??= new Map());
}
