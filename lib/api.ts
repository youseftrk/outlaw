/**
 * Typed client for the Qalaa API (see docs/SPEC.md §10).
 * Client components use the SWR hooks in lib/hooks; server components may call these directly.
 */
import type {
  Agent,
  Approval,
  Bootstrap,
  CVE,
  AttackTechnique,
  ThreatActor,
  DirectorScenario,
  InsightsSummary,
  InsightsWindow,
  Message,
  Migration,
  Policy,
  RangeMode,
  RangeRun,
  RangeScenario,
  ResearchKind,
  ResearchQuery,
  Server,
  Settings,
  Thread,
  Threat,
  Trace,
  Autonomy,
  Tapback,
} from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

export const fetcher = <T>(path: string) => get<T>(path);

export interface AgentDetail {
  agent: Agent;
  traces: Trace[];
  messages: Message[];
  threats: Threat[];
  servers: Server[];
}
export interface ThreatDetail {
  threat: Threat;
  traces: Trace[];
  servers: Server[];
  messages: Message[];
}
export interface ServerDetail {
  server: Server;
  threats: Threat[];
  traces: Trace[];
  migrations: Migration[];
}
export interface RangeOverview {
  scenarios: RangeScenario[];
  activeRun: RangeRun | null;
  history: RangeRun[];
}
export interface SendResult {
  sent: Message;
  replies: Message[];
}

/** The server wraps collections in named envelopes ({ agents: [...] }); these helpers unwrap them. */
const unwrap =
  <T,>(key: string) =>
  (r: Record<string, unknown>) =>
    r[key] as T;

export const api = {
  bootstrap: () => get<Bootstrap>("/bootstrap"),
  health: () => get<{ ok: boolean; uptimeSec: number; tick: number; clients: number }>("/health"),

  agents: {
    list: () => get<{ agents: Agent[] }>("/agents").then(unwrap<Agent[]>("agents")),
    get: (id: string) =>
      get<Partial<AgentDetail> & { agent: Agent }>(`/agents/${id}`).then((r) => ({
        agent: r.agent,
        traces: r.traces ?? [],
        messages: r.messages ?? [],
        threats: r.threats ?? [],
        servers: r.servers ?? [],
      })),
    update: (id: string, body: { autonomy?: Autonomy; paused?: boolean; assignedServerIds?: string[] }) =>
      patch<Agent>(`/agents/${id}`, body),
  },

  threats: {
    list: (q: { status?: string; severity?: string; category?: string; limit?: number } = {}) =>
      get<{ threats: Threat[] }>(`/threats${qs(q)}`).then(unwrap<Threat[]>("threats")),
    get: (id: string) => get<ThreatDetail>(`/threats/${id}`),
    action: (id: string, action: "false-positive" | "escalate" | "close") =>
      post<Threat>(`/threats/${id}/action`, { action }),
  },

  fleet: {
    servers: () => get<{ servers: Server[] }>("/fleet/servers").then(unwrap<Server[]>("servers")),
    server: (id: string) =>
      get<Partial<ServerDetail> & { server: Server }>(`/fleet/servers/${id}`).then((r) => ({
        server: r.server,
        threats: r.threats ?? [],
        traces: r.traces ?? [],
        migrations: r.migrations ?? [],
      })),
    runConformance: (id: string) => post<{ traceId: string }>(`/fleet/servers/${id}/conformance`),
    migrations: () => get<{ migrations: Migration[] }>("/fleet/migrations").then(unwrap<Migration[]>("migrations")),
    createMigration: (body: {
      sourceServerId: string;
      targetServerId?: string;
      targetSpec?: Migration["targetSpec"];
      reason: Migration["reason"];
      workloads: string[];
    }) => post<Migration>("/fleet/migrations", body),
    migrationAction: (id: string, action: "approve" | "dry-run" | "execute" | "rollback") =>
      post<Migration>(`/fleet/migrations/${id}/${action}`),
  },

  governance: {
    traces: (q: { agentId?: string; threatId?: string; verdict?: string; limit?: number } = {}) =>
      get<{ traces: Trace[] }>(`/governance/traces${qs(q)}`).then(unwrap<Trace[]>("traces")),
    trace: (id: string) => get<{ trace: Trace }>(`/governance/traces/${id}`).then(unwrap<Trace>("trace")),
    policies: () => get<{ policies: Policy[] }>("/governance/policies").then(unwrap<Policy[]>("policies")),
    createPolicy: (body: Omit<Policy, "id" | "createdAt" | "updatedAt" | "hits">) =>
      post<Policy>("/governance/policies", body),
    updatePolicy: (id: string, body: Partial<Policy>) => patch<Policy>(`/governance/policies/${id}`, body),
    deletePolicy: (id: string) => del<{ ok: true }>(`/governance/policies/${id}`),
    approvals: (status?: string) =>
      get<{ approvals: Approval[] }>(`/governance/approvals${qs({ status })}`).then(unwrap<Approval[]>("approvals")),
    decide: (id: string, decision: "approve" | "reject") =>
      post<Approval>(`/governance/approvals/${id}`, { decision }),
    exportUrl: "/api/governance/export",
  },

  messages: {
    threads: () => get<{ threads: Thread[] }>("/messages/threads").then(unwrap<Thread[]>("threads")),
    thread: (id: string, limit = 200) =>
      get<{ messages: Message[] }>(`/messages/threads/${id}${qs({ limit })}`).then(unwrap<Message[]>("messages")),
    send: (threadId: string, text: string) => post<SendResult>(`/messages/threads/${threadId}`, { text }),
    read: (threadId: string) => post<{ ok: true }>(`/messages/threads/${threadId}/read`),
    tapback: (messageId: string, tapback: Tapback | null) =>
      post<Message>(`/messages/${messageId}/tapback`, { tapback }),
  },

  research: {
    queries: () => get<{ queries: ResearchQuery[] }>("/research/queries").then(unwrap<ResearchQuery[]>("queries")),
    ask: (query: string, kind?: ResearchKind) => post<ResearchQuery>("/research", { query, kind }),
    kb: (type: "cve" | "technique" | "actor", q = "") =>
      get<Record<string, Array<CVE | AttackTechnique | ThreatActor>>>(`/research/kb${qs({ type, q })}`).then(
        (r) => (Object.values(r).find((v) => Array.isArray(v)) ?? []) as Array<CVE | AttackTechnique | ThreatActor>,
      ),
  },

  insights: (window: InsightsWindow = "7d") => get<InsightsSummary>(`/insights${qs({ window })}`),

  range: {
    overview: () =>
      get<{ scenarios: RangeScenario[]; activeRun: RangeRun | null; runs?: RangeRun[]; history?: RangeRun[] }>("/range").then((r) => ({
        scenarios: r.scenarios,
        activeRun: r.activeRun,
        history: r.history ?? r.runs ?? [],
      })),
    start: (scenarioId: string, mode: RangeMode, speed: number) =>
      post<RangeRun>("/range/run", { scenarioId, mode, speed }),
    get: (runId: string) => get<RangeRun | { run: RangeRun }>(`/range/${runId}`).then((r) => ("run" in r ? r.run : r)),
    action: (runId: string, action: "pause" | "resume" | "abort") => post<RangeRun>(`/range/${runId}/${action}`),
    speed: (runId: string, speed: number) => post<RangeRun>(`/range/${runId}/speed`, { speed }),
  },

  director: (scenario: DirectorScenario) => post<{ ok: true }>("/director", { scenario }),

  settings: {
    get: () => get<Settings>("/settings"),
    update: (body: {
      llm?: Partial<Settings["llm"]> & { apiKey?: string };
      operator?: Partial<Settings["operator"]>;
      sim?: Partial<Settings["sim"]>;
    }) => patch<Settings>("/settings", body),
    testLlm: () => post<Settings["llm"]["lastTest"]>("/settings/llm/test"),
  },
};

function qs(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (!entries.length) return "";
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}
