/**
 * Shared mutable registries pinned on globalThis. Next/Turbopack loads
 * instrumentation and route handlers in separate module contexts — module
 * singletons alone would diverge. Anything that must be process-unique
 * (state, secrets, SSE listeners, approval waiters, id counters, the tick
 * timer) lives here.
 */
import type { QalaaEvent, ApprovalStatus, ID } from "@/lib/types";
import type { QalaaState, QalaaSecrets } from "./store";

export interface QalaaGlobal {
  __qalaaState?: QalaaState | null;
  __qalaaSecrets?: QalaaSecrets;
  __qalaaListeners?: Set<(ev: QalaaEvent) => void>;
  __qalaaWaiters?: Map<ID, (d: ApprovalStatus) => void>;
  __qalaaCounters?: Map<string, number>;
  __qalaaTimer?: unknown;
  __qalaaRt?: unknown;
  __qalaaRangeAttempts?: Map<string, Map<number, number>>;
  __qalaaPatrolAt?: Record<string, number>;
  __qalaaEnvPwHash?: { password: string; hash: string };
  __qalaaSecretsDisk?: { mtimeMs: number; auth: QalaaSecrets["auth"] };
  __qalaaLoginLimiter?: unknown;
}

export const G = globalThis as unknown as QalaaGlobal;

export function counters(): Map<string, number> {
  return (G.__qalaaCounters ??= new Map());
}
export function listeners(): Set<(ev: QalaaEvent) => void> {
  return (G.__qalaaListeners ??= new Set());
}
export function waiters(): Map<ID, (d: ApprovalStatus) => void> {
  return (G.__qalaaWaiters ??= new Map());
}
