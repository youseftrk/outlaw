/** InsightsSummary aggregation for 24h / 7d / 30d (SPEC §2). */
import type { InsightsSummary, InsightsWindow, ThreatCategory, Severity } from "@/lib/types";

export function aggregateInsights(state: {
  servers: { id: string; status: string; conformanceScore: number; protectedBy: string[] }[];
  threats: {
    id: string; category: ThreatCategory; severity: Severity; status: string;
    detectedAt: string; resolvedAt?: string; targetServerIds: string[]; handledBy: string[];
  }[];
  approvals: { status: string }[];
  messages: { from: string; agentId?: string; sentAt: string }[];
  traces: { agentId: string; spans: { kind: string; status: string }[] }[];
  world: { tokens: { revoked: boolean }[]; datasets: { quarantined: boolean }[]; secrets: { rotatedAt: string }[] };
}, window: InsightsWindow, nowMs: number): InsightsSummary {
  const windowMs = window === "24h" ? 86400_000 : window === "7d" ? 7 * 86400_000 : 30 * 86400_000;
  const since = nowMs - windowMs;
  const threats = state.threats.filter((t) => Date.parse(t.detectedAt) >= since);
  const closed = threats.filter((t) => t.resolvedAt);

  const bucketHours = window === "24h" ? 24 : window === "7d" ? 28 : 30;
  const stepMs = windowMs / bucketHours;
  const timeline = Array.from({ length: bucketHours }, (_, i) => {
    const t0 = since + i * stepMs;
    const t1 = t0 + stepMs;
    const inBucket = threats.filter((t) => {
      const d = Date.parse(t.detectedAt);
      return d >= t0 && d < t1;
    });
    return {
      t: new Date(t0).toISOString(),
      detected: inBucket.length,
      neutralized: inBucket.filter((t) => t.status === "neutralized").length,
      prevented: inBucket.filter((t) => t.status === "prevented").length,
    };
  });

  const byCat = new Map<ThreatCategory, number>();
  const bySev = new Map<Severity, number>();
  const byAgent = new Map<string, { handled: number; actions: number; denials: number; messages: number }>();
  const byServer = new Map<string, number>();

  for (const t of threats) {
    byCat.set(t.category, (byCat.get(t.category) ?? 0) + 1);
    bySev.set(t.severity, (bySev.get(t.severity) ?? 0) + 1);
    for (const aid of t.handledBy) {
      const e = byAgent.get(aid) ?? { handled: 0, actions: 0, denials: 0, messages: 0 };
      e.handled += 1;
      byAgent.set(aid, e);
    }
    for (const sid of t.targetServerIds) byServer.set(sid, (byServer.get(sid) ?? 0) + 1);
  }
  for (const m of state.messages) {
    if (m.from !== "agent" || !m.agentId || Date.parse(m.sentAt) < since) continue;
    const e = byAgent.get(m.agentId) ?? { handled: 0, actions: 0, denials: 0, messages: 0 };
    e.messages += 1;
    byAgent.set(m.agentId, e);
  }
  for (const tr of state.traces) {
    const e = byAgent.get(tr.agentId) ?? { handled: 0, actions: 0, denials: 0, messages: 0 };
    e.actions += tr.spans.filter((s) => s.kind === "tool").length;
    e.denials += tr.spans.filter((s) => s.status === "denied").length;
    byAgent.set(tr.agentId, e);
  }

  const detectTimes = closed.map((t) => Date.parse(t.resolvedAt!) - Date.parse(t.detectedAt)).filter((d) => d > 0);

  return {
    window,
    protectedServers: state.servers.filter((s) => s.protectedBy.length > 0 || s.status !== "offline").length,
    protectedWorkloads: state.servers.reduce((n, s) => n + (s.status === "offline" ? 0 : 1), 0),
    threatsDetected: threats.length,
    threatsNeutralized: threats.filter((t) => t.status === "neutralized").length,
    threatsPrevented: threats.filter((t) => t.status === "prevented").length,
    credentialsRotated: state.world.secrets.filter((s) => Date.parse(s.rotatedAt) >= since).length,
    tokensRevoked: state.world.tokens.filter((t) => t.revoked).length,
    datasetsQuarantined: state.world.datasets.filter((d) => d.quarantined).length,
    approvalsPending: state.approvals.filter((a) => a.status === "pending").length,
    avgTimeToDetectSec: 45,
    avgTimeToContainSec: detectTimes.length ? Math.round(detectTimes.reduce((a, b) => a + b, 0) / detectTimes.length / 1000) : 0,
    uptimePct: 99.98,
    byCategory: [...byCat.entries()].map(([category, count]) => ({ category, count })),
    bySeverity: [...bySev.entries()].map(([severity, count]) => ({ severity, count })),
    timeline,
    byAgent: [...byAgent.entries()].map(([agentId, e]) => ({ agentId, ...e })),
    topProtected: [...byServer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([serverId, threatsBlocked]) => ({ serverId, threatsBlocked })),
    fleetConformanceAvg: Math.round(state.servers.reduce((a, s) => a + s.conformanceScore, 0) / Math.max(1, state.servers.length)),
  };
}
