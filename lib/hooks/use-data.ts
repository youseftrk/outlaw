"use client";

/** SWR hooks over the Outlaw API. Keys mirror API paths so live events can invalidate them by prefix. */
import useSWR, { type SWRConfiguration } from "swr";
import { api, fetcher, type AgentDetail, type RangeOverview, type ServerDetail, type ThreatDetail } from "@/lib/api";
import type {
  Agent,
  Approval,
  Bootstrap,
  InsightsSummary,
  InsightsWindow,
  Message,
  Migration,
  Policy,
  ResearchQuery,
  Server,
  Settings,
  Thread,
  Threat,
  Trace,
} from "@/lib/types";

const opts: SWRConfiguration = { revalidateOnFocus: false, dedupingInterval: 1000, keepPreviousData: true };

export const useBootstrap = () => useSWR<Bootstrap>("/bootstrap", fetcher, { ...opts, refreshInterval: 15000 });
const params = (query: string) => Object.fromEntries(new URLSearchParams(query.replace(/^\?/, "")));

export const useAgents = () => useSWR<Agent[]>("/agents", () => api.agents.list(), opts);
export const useAgent = (id?: string) => useSWR<AgentDetail>(id ? `/agents/${id}` : null, () => api.agents.get(id!), opts);
export const useThreats = (query = "") => useSWR<Threat[]>(`/threats${query}`, () => api.threats.list(params(query)), opts);
export const useThreat = (id?: string) => useSWR<ThreatDetail>(id ? `/threats/${id}` : null, () => api.threats.get(id!), opts);
export const useServers = () => useSWR<Server[]>("/fleet/servers", () => api.fleet.servers(), opts);
export const useServer = (id?: string) => useSWR<ServerDetail>(id ? `/fleet/servers/${id}` : null, () => api.fleet.server(id!), opts);
export const useMigrations = () => useSWR<Migration[]>("/fleet/migrations", () => api.fleet.migrations(), opts);
export const useTraces = (query = "") => useSWR<Trace[]>(`/governance/traces${query}`, () => api.governance.traces(params(query)), opts);
export const useTrace = (id?: string) => useSWR<Trace>(id ? `/governance/traces/${id}` : null, () => api.governance.trace(id!), opts);
export const usePolicies = () => useSWR<Policy[]>("/governance/policies", () => api.governance.policies(), opts);
export const useApprovals = (status?: string) =>
  useSWR<Approval[]>(`/governance/approvals${status ? `?status=${status}` : ""}`, () => api.governance.approvals(status), opts);
export const useThreads = () => useSWR<Thread[]>("/messages/threads", () => api.messages.threads(), opts);
export const useThreadMessages = (threadId?: string) =>
  useSWR<Message[]>(threadId ? `/messages/threads/${threadId}?limit=200` : null, () => api.messages.thread(threadId!), opts);
export const useResearchQueries = () => useSWR<ResearchQuery[]>("/research/queries", () => api.research.queries(), opts);
export const useInsights = (window: InsightsWindow) =>
  useSWR<InsightsSummary>(`/insights?window=${window}`, fetcher, { ...opts, refreshInterval: 10000 });
export const useRange = () => useSWR<RangeOverview>("/range", () => api.range.overview(), { ...opts, refreshInterval: 2000 });
export const useSettings = () => useSWR<Settings>("/settings", fetcher, opts);

export { api };
