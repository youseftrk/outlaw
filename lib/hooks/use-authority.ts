"use client";

/**
 * Client for the authority API (docs/PIVOT.md §5). Keys mirror API paths so live
 * `authority.*` events invalidate them; a slow refresh covers the gap when SSE is down.
 */
import * as React from "react";
import useSWR, { useSWRConfig, type SWRConfiguration } from "swr";
import { ApiError, fetcher } from "@/lib/api";
import type {
  AuthorityCheck,
  AuthorityLease,
  AuthorityPath,
  AuthorityScope,
  Capability,
  DecisionRecord,
  DrillState,
  Entity,
  HouseRules,
  OnboardInput,
  PermissionSuggestion,
  RefusalCode,
  Server,
} from "@/lib/types";

const opts: SWRConfiguration = { revalidateOnFocus: false, dedupingInterval: 1000, keepPreviousData: true, refreshInterval: 4000 };

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string; message?: string };
      msg = j.message ?? j.error ?? msg;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const useEntities = () => useSWR<Entity[]>("/authority/entities", fetcher, { ...opts, refreshInterval: 0 });
export const useLeases = (query = "") => useSWR<AuthorityLease[]>(`/authority/leases${query}`, fetcher, opts);
export const useLease = (id?: string | null) => useSWR<AuthorityLease>(id ? `/authority/leases/${id}` : null, fetcher, opts);
export const useAuthorityPath = (id?: string | null) => useSWR<AuthorityPath>(id ? `/authority/path/${id}` : null, fetcher, opts);
export const useRecords = (query = "?limit=60") => useSWR<DecisionRecord[]>(`/authority/records${query}`, fetcher, opts);
export const useHouseRules = () => useSWR<HouseRules[]>("/authority/rules", fetcher, opts);
export const useDrillState = () => useSWR<DrillState>("/authority/step", fetcher, { ...opts, refreshInterval: 2000 });

export interface ProtectedResult {
  ok: boolean;
  status: number;
  code?: RefusalCode;
  leaseId?: string;
  record?: DecisionRecord;
  message?: string;
  checks: AuthorityCheck[];
}

/** Calls the protected endpoint exactly as an outside client would; never throws on 403 so the UI can show the refusal. */
export async function callProtected(input: {
  ownerEntityId: string;
  capability: Capability;
  actorId: string;
  serverId?: string;
}): Promise<ProtectedResult> {
  const res = await fetch(`/api/protected/${input.ownerEntityId}/${input.capability}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ actorId: input.actorId, serverId: input.serverId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: RefusalCode;
    leaseId?: string;
    record?: DecisionRecord;
    message?: string;
    checks?: AuthorityCheck[];
  };
  return {
    ok: res.ok,
    status: res.status,
    code: body.error,
    leaseId: body.leaseId,
    record: body.record,
    message: body.message,
    checks: body.checks ?? [],
  };
}

export const authorityApi = {
  request: (body: {
    requestingEntityId: string;
    ownerEntityId: string;
    agentId?: string;
    capability: Capability;
    scope: AuthorityScope;
    justification: string;
    incidentId?: string;
    durationSec: number;
  }) => post<AuthorityLease>("/authority/leases", body),
  accept: (id: string, by: string) => post<AuthorityLease>(`/authority/leases/${id}/accept`, { by }),
  decline: (id: string, by: string, reason?: string) => post<AuthorityLease>(`/authority/leases/${id}/decline`, { by, reason }),
  stepUp: (id: string, code: string) => post<AuthorityLease>(`/authority/leases/${id}/step-up`, { code }),
  revoke: (id: string, by: string, reason?: string) => post<AuthorityLease>(`/authority/leases/${id}/revoke`, { by, reason }),
  suggest: (body: { incidentId?: string; agentId?: string; capability?: Capability; serverId?: string }) =>
    post<PermissionSuggestion>("/authority/suggest", body),
  updateRules: (entityId: string, patch: Partial<Omit<HouseRules, "entityId">>) =>
    fetch(`/api/authority/rules/${entityId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, res.statusText);
      return (await res.json()) as HouseRules;
    }),
  reset: (opts?: { fromOnboarding?: boolean }) => post<{ ok: true }>("/authority/reset", opts ?? {}),
  onboard: (body: OnboardInput & { by?: string }) => post<{ server: Server; record: DecisionRecord }>("/authority/onboard", body),
};

/** Invalidate every authority key after a mutation (live events also do this; this makes the UI feel instant). */
export function useRefreshAuthority() {
  const { mutate } = useSWRConfig();
  return () =>
    mutate((key) => typeof key === "string" && (key.startsWith("/authority") || key === "/bootstrap"), undefined, { revalidate: true });
}

const ACTING_KEY = "qalaa.actingAs";
const ACTING_EVENT = "qalaa:acting-as";

/** Which organisation the person at the screen is acting for. Owners get the switch and yes/no; nobody else does. */
export function useActingAs(fallback = "ent-data"): [string, (id: string) => void] {
  const [id, setId] = React.useState(fallback);
  React.useEffect(() => {
    const read = () => setId(window.localStorage.getItem(ACTING_KEY) ?? fallback);
    read();
    window.addEventListener(ACTING_EVENT, read);
    return () => window.removeEventListener(ACTING_EVENT, read);
  }, [fallback]);
  const set = React.useCallback((next: string) => {
    window.localStorage.setItem(ACTING_KEY, next);
    window.dispatchEvent(new Event(ACTING_EVENT));
  }, []);
  return [id, set];
}

export const STATUS_LABEL: Record<AuthorityLease["status"], string> = {
  pending: "Waiting for the owner",
  "pending-step-up": "Waiting for the code",
  active: "Allowed",
  expired: "Ran out",
  revoked: "Taken back",
  declined: "Said no",
};

export const REFUSAL_LABEL: Record<RefusalCode, string> = {
  AUTHORITY_REQUIRED: "No permission",
  AUTHORITY_PENDING: "Permission not yet given",
  AUTHORITY_REVOKED: "Permission taken back",
  AUTHORITY_EXPIRED: "Permission ran out",
  SCOPE_MISMATCH: "Not where the permission applies",
  CAPABILITY_MISMATCH: "Not what the permission allows",
  REQUESTER_MISMATCH: "Permission belongs to another agent",
  STEP_UP_REQUIRED: "Human code still needed",
  NEVER_SHARED: "The owner never shares this data",
  RULES_EXCEEDED: "Outside the owner's house rules",
};

export function scopeLabel(scope: AuthorityScope, hostnameOf: (id: string) => string): string {
  const parts: string[] = [];
  if (scope.serverIds?.length) parts.push(scope.serverIds.map(hostnameOf).join(", "));
  if (scope.clusters?.length) parts.push(scope.clusters.map((c) => `cluster ${c}`).join(", "));
  if (scope.envs?.length) parts.push(scope.envs.map((e) => `all ${e}`).join(", "));
  return parts.length ? parts.join(" · ") : "everything they own";
}

export function durationLabel(sec: number): string {
  if (sec % 3600 === 0) return sec === 3600 ? "1 hour" : `${sec / 3600} hours`;
  if (sec % 60 === 0) return `${sec / 60} min`;
  return `${sec} s`;
}
