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
    key: "saqr",
    name: "Saqr",
    callsign: "the falcon",
    role: "orchestrator",
    mandate: "The coordinator. Notices something is wrong, decides which agent should handle it, and keeps the people in charge informed.",
    description: "First to every signal. Watches the systems, works out what is happening, hands the job to the right agent, and messages the operator when a decision is needed. Saqr only looks — it never changes anything itself.",
    trust: 5,
    tools: ["query_telemetry", "map_attack", "notify_human", "request_approval", "snapshot_evidence"],
  },
  {
    key: "hisn",
    name: "Hisn",
    callsign: "the wall",
    role: "containment",
    mandate: "The responder. Cuts off a system that is under attack so the problem cannot spread.",
    description: "Quiet until something real shows up. Then the fastest hands in the garrison — takes a machine off the network, blocks it from sending data out, fences off a cluster. Containing someone else's system always needs their permission and a human code.",
    trust: 5,
    tools: ["isolate_host", "block_egress", "cordon_cluster", "kill_process", "lock_registry", "snapshot_evidence"],
  },
  {
    key: "athar",
    name: "Athar",
    callsign: "the trace",
    role: "forensics",
    mandate: "The investigator. Works out what happened, step by step, and writes it up in plain words.",
    description: "Reads everything twice. Follows the trail of an incident from the first sign to the last, and writes the report you'd send to the board. Athar only looks and records — it never changes anything.",
    trust: 4,
    tools: ["enrich_ioc", "map_attack", "inspect_worker", "snapshot_evidence", "query_telemetry"],
  },
  {
    key: "miftah",
    name: "Miftah",
    callsign: "keeper of keys",
    role: "credentials",
    mandate: "The key keeper. Finds passwords and access keys that have leaked, and shuts them off.",
    description: "Keeps the keys. Checks that no access key or password is lying in the open, switches off anything that has leaked, and issues new ones after a break-in. Resetting access on another organisation's systems needs their permission.",
    trust: 4,
    tools: ["audit_tokens", "revoke_token", "rotate_credentials", "disable_account", "scan_public_secrets"],
  },
  {
    key: "rahhal",
    name: "Rahhal",
    callsign: "the caravaneer",
    role: "fleet",
    mandate: "The maintainer. Keeps systems healthy, patched, and set up the way they should be.",
    description: "Works the fleet. Checks each system against its rulebook, fixes what has drifted, applies updates, and moves work off a machine that has gone bad. Repairing a system that belongs to someone else needs their permission.",
    trust: 4,
    tools: ["run_conformance", "remediate_drift", "patch_service", "harden_sandbox", "rebuild_node", "migrate_workload"],
  },
  {
    key: "bawwab",
    name: "Bawwab",
    callsign: "the gatekeeper",
    role: "supply-chain",
    mandate: "The gatekeeper. Checks everything coming in — files, datasets, software packages — before it is trusted.",
    description: "Reads every upload before it lands. Looks through incoming data and packages for anything harmful or leaked, sets suspicious files aside, and keeps the software store honest. Setting aside data on another organisation's system needs their permission.",
    trust: 5,
    tools: ["scan_dataset", "quarantine_dataset", "scan_public_secrets", "lock_registry", "inspect_worker"],
  },
];

export function seedAgents(nowIso: string, serverIdsByRole: Record<string, string[]>): Agent[] {
  const rng = makeRng("qalaa-2026:agents");
  const assign: Record<string, string[]> = {
    saqr: [], // sees everything
    hisn: [...serverIdsByRole.prodAll],
    athar: ["srv-pkg-cache-01", ...(serverIdsByRole.worker ?? [])],
    miftah: [],
    rahhal: [...serverIdsByRole.all],
    bawwab: ["srv-pkg-cache-01", "srv-ci-01", "srv-scm-01", ...(serverIdsByRole.worker ?? [])],
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
