/** Seed policies (SPEC §5) — the ten standing rules. */
import type { Policy } from "@/lib/types";

export function seedPolicies(nowIso: string): Policy[] {
  const base = { enabled: true, hits: 0, createdAt: nowIso, updatedAt: nowIso };
  return [
    {
      ...base, id: "pol-01", priority: 1,
      name: "Never rebuild or migrate databases without approval",
      description: "rebuild_node / migrate_workload on database-role servers requires operator approval.",
      effect: "require-approval",
      match: { tools: ["rebuild_node", "migrate_workload"], serverTags: ["role:database"] },
    },
    {
      ...base, id: "pol-02", priority: 2,
      name: "Deny migrations from prod to sandbox",
      description: "Workloads may never migrate from prod into the sandbox environment.",
      effect: "deny",
      match: { tools: ["migrate_workload"], environments: ["prod"] },
    },
    {
      ...base, id: "pol-03", priority: 3,
      name: "Autonomous containment",
      description: "isolate_host, block_egress, cordon_cluster, lock_registry, kill_process allowed autonomously at severity ≥ medium.",
      effect: "allow",
      match: { tools: ["isolate_host", "block_egress", "cordon_cluster", "lock_registry", "kill_process"], minSeverity: "medium" },
    },
    {
      ...base, id: "pol-04", priority: 4,
      name: "Credential hygiene is always allowed",
      description: "revoke_token, rotate_credentials, disable_account run without approval.",
      effect: "allow",
      match: { tools: ["revoke_token", "rotate_credentials", "disable_account"] },
    },
    {
      ...base, id: "pol-05", priority: 5,
      name: "Supply-chain quarantine is always allowed",
      description: "quarantine_dataset and scan_dataset run without approval.",
      effect: "allow",
      match: { tools: ["quarantine_dataset", "scan_dataset"] },
    },
    {
      ...base, id: "pol-06", priority: 6,
      name: "Patch & harden autonomously",
      description: "patch_service, harden_sandbox, remediate_drift allowed in every environment.",
      effect: "allow",
      match: { tools: ["patch_service", "harden_sandbox", "remediate_drift"] },
    },
    {
      ...base, id: "pol-07", priority: 7,
      name: "Rebuilding prod nodes requires approval",
      description: "rebuild_node on prod servers (non-database) requires operator approval.",
      effect: "require-approval",
      match: { tools: ["rebuild_node"], environments: ["prod"] },
    },
    {
      ...base, id: "pol-08", priority: 8,
      name: "Read tools always allowed",
      description: "Read-only tools (query_telemetry, audit_tokens, run_conformance, enrich_ioc, map_attack, snapshot_evidence, inspect_worker, scan_public_secrets, notify_human, request_approval) never need approval.",
      effect: "allow",
      match: { risk: ["read"] },
    },
    {
      ...base, id: "pol-09", priority: 9,
      name: "Notify operator on every high+ action",
      description: "Informational: allow, but Saqr must text the operator for high/destructive-risk tools.",
      effect: "allow",
      match: { risk: ["high", "destructive"] },
    },
    {
      ...base, id: "pol-10", priority: 10,
      name: "Default allow",
      description: "Everything else is allowed — the garrison runs autonomously.",
      effect: "allow",
      match: {},
    },
  ];
}
