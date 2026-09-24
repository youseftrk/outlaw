/**
 * Seed history: ~60 resolved noise threats over 7 days with traces,
 * thread messages, and 3 completed migrations (SPEC §2).
 * Threat ids start at T-1001 so runtime ids continue T-1061+.
 */
import type {
  Agent, Message, Migration, MigrationStep, Server, Thread, Threat, Trace,
  ThreatCategory, Severity, GeoPoint, IOC,
} from "@/lib/types";
import { makeRng } from "../rng";
import { iso } from "../time";
import { setCounter } from "../ids";

const ORIGINS: { ip: string; geo: GeoPoint; label: string }[] = [
  { ip: "185.220.101.4", geo: { lat: 52.52, lng: 13.4, city: "Berlin", country: "DE" }, label: "Tor exit" },
  { ip: "185.220.102.8", geo: { lat: 52.37, lng: 4.9, city: "Amsterdam", country: "NL" }, label: "Tor exit" },
  { ip: "103.75.190.11", geo: { lat: 21.03, lng: 105.85, city: "Hanoi", country: "VN" }, label: "residential proxy" },
  { ip: "177.54.144.32", geo: { lat: -23.55, lng: -46.63, city: "São Paulo", country: "BR" }, label: "bulletproof host" },
  { ip: "91.240.118.77", geo: { lat: 55.75, lng: 37.61, city: "Moscow", country: "RU" }, label: "VPS" },
  { ip: "119.123.44.201", geo: { lat: 22.54, lng: 114.06, city: "Shenzhen", country: "CN" }, label: "residential proxy" },
  { ip: "73.41.208.15", geo: { lat: 32.77, lng: -96.8, city: "Dallas", country: "US" }, label: "residential proxy" },
];

const NOISE: { category: ThreatCategory; title: string; sev: Severity; roles: string[] }[] = [
  { category: "brute-force", title: "SSH brute-force burst", sev: "low", roles: ["bastion", "vpn"] },
  { category: "credential-stuffing", title: "Credential-stuffing wave on login", sev: "medium", roles: ["web", "api"] },
  { category: "prompt-injection", title: "Prompt-injection attempt in inference input", sev: "low", roles: ["inference"] },
  { category: "misconfiguration", title: "Config drift detected", sev: "low", roles: ["api", "worker", "k8s-node"] },
  { category: "c2-beacon", title: "Periodic beacon pattern on egress", sev: "medium", roles: ["worker", "k8s-node"] },
  { category: "recon", title: "Port scan / endpoint enumeration", sev: "low", roles: ["web", "api", "bastion"] },
];

export interface SeedHistory {
  threats: Threat[];
  traces: Trace[];
  messages: Message[];
  migrations: Migration[];
  threads: Thread[];
}

export function seedHistory(nowIso: string, servers: Server[], agents: Agent[]): SeedHistory {
  const rng = makeRng("outlaw-2026:history");
  const now = new Date(nowIso).getTime();
  const threats: Threat[] = [];
  const traces: Trace[] = [];
  const messages: Message[] = [];
  const migrations: Migration[] = [];
  const threads: Thread[] = [];

  const agentByRole = (r: string) => agents.find((a) => a.role === r)!;
  const handlerFor = (cat: ThreatCategory): Agent =>
    cat === "misconfiguration" ? agentByRole("fleet")
    : cat === "prompt-injection" ? agentByRole("forensics")
    : cat === "credential-stuffing" ? agentByRole("credentials")
    : agentByRole("containment");

  for (let i = 0; i < 60; i++) {
    const kind = rng.pick(NOISE);
    const pool = servers.filter((s) => kind.roles.includes(s.role));
    const srv = pool[rng.int(0, pool.length - 1)];
    const origin = rng.pick(ORIGINS);
    const detectedAgo = rng.int(30, 10080); // up to 7 days back, minutes
    const detectedAt = iso(now - detectedAgo * 60_000);
    const detectMs = rng.int(5, 45) * 1000;   // signal → threat
    const containMs = rng.int(20, 120) * 1000; // detected → resolved
    const traceStartAt = iso(Date.parse(detectedAt) + detectMs);
    const resolvedAt = iso(Date.parse(detectedAt) + Math.max(containMs, detectMs + 5000));
    const id = `T-${1001 + i}`;
    const traceId = `TR-${2001 + i}`;
    const agent = handlerFor(kind.category);
    const falsePositive = rng.chance(0.12);
    const status = falsePositive ? "false-positive" : rng.chance(0.15) ? "prevented" : "neutralized";
    const iocs: IOC[] = [
      { type: "ip", value: origin.ip, confidence: rng.next() * 0.4 + 0.5, firstSeen: detectedAt, tags: [origin.label] },
    ];

    threats.push({
      id,
      title: `${kind.title} — ${srv.hostname}`,
      category: kind.category,
      severity: kind.sev,
      status,
      summary: `${kind.title} against ${srv.hostname} from ${origin.geo.city ?? origin.geo.country}; ${status === "false-positive" ? "closed as false positive" : "handled autonomously"}.`,
      source: { ip: origin.ip, geo: origin.geo, actorLabel: origin.label, userAgent: "scanner/1.x" },
      targetServerIds: [srv.id],
      handledBy: [agent.id],
      attack: {
        techniqueIds: kind.category === "brute-force" || kind.category === "credential-stuffing" ? ["T1110"] : kind.category === "recon" ? ["T1595"] : kind.category === "c2-beacon" ? ["T1071"] : kind.category === "prompt-injection" ? ["T1059"] : ["T1496"],
        killChain: [
          { stage: "recon", at: detectedAt, note: "origin probed the edge", outcome: "observed" },
          { stage: "initial-access", at: resolvedAt, note: status === "false-positive" ? "closed — benign pattern" : "blocked before access", outcome: status === "false-positive" ? "observed" : "prevented" },
        ],
      },
      iocs,
      traceIds: [traceId],
      messageIds: [],
      detectedAt,
      updatedAt: resolvedAt,
      resolvedAt,
    });

    traces.push({
      id: traceId,
      agentId: agent.id,
      threatId: id,
      intent: `respond to ${kind.category} on ${srv.hostname}`,
      spans: [
        { id: `SP-${traceId}-1`, kind: "observe", label: "signal correlation", startedAt: traceStartAt, endedAt: traceStartAt, status: "ok" },
        { id: `SP-${traceId}-2`, kind: "reason", label: "assessed severity", startedAt: traceStartAt, endedAt: traceStartAt, status: "ok", input: { category: kind.category }, output: { severity: kind.sev } },
        { id: `SP-${traceId}-3`, kind: "tool", label: status === "false-positive" ? "closed as false positive" : "contained routinely", toolName: "snapshot_evidence", startedAt: resolvedAt, endedAt: resolvedAt, status: "ok" },
        { id: `SP-${traceId}-4`, kind: "outcome", label: `threat ${status}`, startedAt: resolvedAt, endedAt: resolvedAt, status: "ok" },
      ],
      verdict: status === "false-positive" ? "completed" : "completed",
      riskScore: kind.sev === "medium" ? 30 : 15,
      startedAt: traceStartAt,
      endedAt: resolvedAt,
    });

    if (rng.chance(0.45)) {
      const msgId = `MSG-${5000 + i}`;
      threats[i].messageIds.push(msgId);
      messages.push({
        id: msgId,
        threadId: `thr-${agent.name.toLowerCase()}`,
        from: "agent",
        agentId: agent.id,
        kind: status === "false-positive" ? "status" : "alert",
        text:
          status === "false-positive"
            ? `That ${kind.category} flag on ${srv.hostname} was noise — closed it.`
            : `Cleaned up a ${kind.category} on ${srv.hostname} — ${origin.geo.city ?? origin.geo.country} origin. Nothing got through.`,
        severity: kind.sev,
        threatId: id,
        traceId,
        sentAt: resolvedAt,
        deliveredAt: resolvedAt,
        readAt: resolvedAt,
      });
    }
  }

  // 3 completed migrations
  const migSpecs = [
    { src: "srv-api-02", dst: "srv-prod-node-02", reason: "capacity" as const, title: "Rebalance hub-api onto prod-node-02", daysAgo: 6 },
    { src: "srv-dataset-worker-02", dst: "srv-prod-node-03", reason: "cost" as const, title: "Move parquet-convert to spot capacity", daysAgo: 3 },
    { src: "srv-inference-03", dst: "srv-inference-02", reason: "compliance" as const, title: "Consolidate embeddings in us-west", daysAgo: 1 },
  ];
  migSpecs.forEach((m, i) => {
    const src = servers.find((s) => s.id === m.src);
    if (!src) return;
    const created = iso(now - m.daysAgo * 86400_000);
    const done = iso(now - m.daysAgo * 86400_000 + 2400_000);
    const stepNames = ["snapshot", "provision target", "sync data", "cut traffic", "verify health", "decommission source"];
    const steps: MigrationStep[] = stepNames.map((name, j) => ({
      id: `MS-${i}-${j}`,
      name,
      status: "done",
      startedAt: created,
      finishedAt: done,
      log: [`${name} completed`],
    }));
    migrations.push({
      id: `M-${301 + i}`,
      title: m.title,
      reason: m.reason,
      sourceServerId: m.src,
      targetServerId: m.dst,
      workloads: src.workloads,
      status: "completed",
      steps,
      ownerAgentId: "agt-ringo",
      traceIds: [],
      progress: 100,
      createdAt: created,
      updatedAt: done,
    });
  });

  // threads
  for (const agent of agents) {
    const tid = `thr-${agent.name.toLowerCase()}`;
    const msgs = messages.filter((m) => m.threadId === tid);
    const last = msgs[msgs.length - 1];
    threads.push({
      id: tid,
      agentId: agent.id,
      title: agent.name,
      lastMessageAt: last?.sentAt ?? nowIso,
      lastPreview: last?.text ?? "Riding quiet. Nothing to report.",
      unread: 0,
      pinned: agent.id === "agt-cassidy",
    });
  }
  threads.push({
    id: "thr-outlaw",
    agentId: "agt-cassidy",
    title: "Outlaw",
    lastMessageAt: nowIso,
    lastPreview: "Daily digest — 60 threats handled this week, zero touched prod data.",
    unread: 0,
    pinned: true,
  });
  messages.push({
    id: "MSG-9001",
    threadId: "thr-outlaw",
    from: "system",
    kind: "report",
    text: "Weekly digest — 60 threats handled, 0 approvals needed, fleet conformance holding. The gang rides autonomous.",
    severity: "info",
    sentAt: iso(now - 86400_000),
    deliveredAt: iso(now - 86400_000),
  });

  // counters continue after seeded ids
  setCounter("T-", 1060);
  setCounter("TR-", 2060);
  setCounter("MSG-", 9002);
  setCounter("M-", 303);

  return { threats, traces, messages, migrations, threads };
}
