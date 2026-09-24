/** Seed: the six agents (SPEC §4) — all autonomous, trust 4–5. */
import type { Agent, AgentRole, ToolName } from "@/lib/types";
import { makeRng } from "../rng";

interface AgentSpec {
  key: string;
  name: string;
  callsign: string;
  role: AgentRole;
  mandate: string;
  description: string;
  trust: number;
  tools: ToolName[];
}

const AGENTS: AgentSpec[] = [
  {
    key: "cassidy",
    name: "Cassidy",
    callsign: "rides point",
    role: "orchestrator",
    mandate: "Triage every signal, assign the gang, keep the operator informed. Owns the operator thread and approval requests.",
    description: "First to every signal. Reads the telemetry feed, correlates it into threats, decides who rides on it, and texts the operator when it matters.",
    trust: 5,
    tools: ["query_telemetry", "map_attack", "notify_human", "request_approval", "snapshot_evidence"],
  },
  {
    key: "sundance",
    name: "Sundance",
    callsign: "fast draw",
    role: "containment",
    mandate: "Stop lateral movement and egress before it spreads.",
    description: "Quiet until something real shows up. Then the fastest hands in the gang — isolates hosts, blocks egress, cordons clusters.",
    trust: 5,
    tools: ["isolate_host", "block_egress", "cordon_cluster", "kill_process", "lock_registry", "snapshot_evidence"],
  },
  {
    key: "doc",
    name: "Doc",
    callsign: "Holliday",
    role: "forensics",
    mandate: "Patient, precise investigation: enrich IOCs, reconstruct kill chains, write the report.",
    description: "Reads everything twice. Enriches indicators, maps attack techniques, and writes the report you'd send to the board.",
    trust: 4,
    tools: ["enrich_ioc", "map_attack", "inspect_worker", "snapshot_evidence", "query_telemetry"],
  },
  {
    key: "belle",
    name: "Belle",
    callsign: "Starr",
    role: "credentials",
    mandate: "Audit, revoke, rotate — no token left exposed.",
    description: "Keeps the keys. Audits token hygiene on a loop, revokes anything exposed the moment it leaks, and rotates credentials on compromise.",
    trust: 4,
    tools: ["audit_tokens", "revoke_token", "rotate_credentials", "disable_account", "scan_public_secrets"],
  },
  {
    key: "ringo",
    name: "Ringo",
    callsign: "the drover",
    role: "fleet",
    mandate: "Conformance, patching, rebuilds, migrations.",
    description: "Works the herd. Runs conformance checks round-robin, fixes drift, patches services, and moves workloads when a host goes bad.",
    trust: 4,
    tools: ["run_conformance", "remediate_drift", "patch_service", "harden_sandbox", "rebuild_node", "migrate_workload"],
  },
  {
    key: "calamity",
    name: "Calamity",
    callsign: "Jane",
    role: "supply-chain",
    mandate: "Smells trouble first: datasets, packages, pipelines, registry.",
    description: "Reads every upload before it lands. Scans public datasets for leaked secrets, quarantines malicious payloads, keeps the registry honest.",
    trust: 5,
    tools: ["scan_dataset", "quarantine_dataset", "scan_public_secrets", "lock_registry", "inspect_worker"],
  },
];

export function seedAgents(nowIso: string, serverIdsByRole: Record<string, string[]>): Agent[] {
  const rng = makeRng("outlaw-2026:agents");
  const assign: Record<string, string[]> = {
    cassidy: [], // sees everything
    sundance: [...serverIdsByRole.prodAll],
    doc: ["srv-pkg-cache-01", ...(serverIdsByRole.worker ?? [])],
    belle: [],
    ringo: [...serverIdsByRole.all],
    calamity: ["srv-pkg-cache-01", "srv-ci-01", "srv-scm-01", ...(serverIdsByRole.worker ?? [])],
  };
  return AGENTS.map((a) => ({
    id: `agt-${a.key}`,
    name: a.name,
    callsign: a.callsign,
    role: a.role,
    mandate: a.mandate,
    description: a.description,
    status: "observing" as const,
    autonomy: "autonomous" as const,
    trustLevel: a.trust,
    tools: a.tools,
    assignedServerIds: assign[a.key] ?? [],
    metrics: {
      threatsHandled: rng.int(14, 38),
      actionsTaken: rng.int(40, 120),
      approvalsRequested: rng.int(0, 4),
      messagesSent: rng.int(30, 90),
      policyDenials: rng.int(0, 3),
      avgTimeToDetectSec: rng.int(5, 45),
      avgTimeToContainSec: rng.int(20, 120),
    },
    heartbeatAt: nowIso,
    createdAt: nowIso,
    activity: Array.from({ length: 24 }, () => rng.int(0, 9)),
  }));
}
