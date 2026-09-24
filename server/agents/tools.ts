/** ToolSpec table for every ToolName (SPEC §2). */
import type { ToolName, ToolRisk, ToolSpec, ToolTarget } from "@/lib/types";

export const TOOL_SPECS: Record<ToolName, ToolSpec> = {
  query_telemetry: { name: "query_telemetry", label: "Query telemetry", description: "Read the telemetry ring buffer for signals matching a filter.", risk: "read", targets: ["none"] },
  scan_public_secrets: { name: "scan_public_secrets", label: "Scan public secrets", description: "Scan public datasets for leaked credentials/tokens.", risk: "read", targets: ["dataset"] },
  audit_tokens: { name: "audit_tokens", label: "Audit tokens", description: "Audit token hygiene: stale write/admin tokens, new-ASN usage.", risk: "read", targets: ["token"] },
  revoke_token: { name: "revoke_token", label: "Revoke token", description: "Revoke one or more tokens immediately.", risk: "medium", targets: ["token"] },
  rotate_credentials: { name: "rotate_credentials", label: "Rotate credentials", description: "Rotate secrets (cloud/vpn/scm/messaging/storage/k8s) or a host's env secrets.", risk: "medium", targets: ["server", "none"] },
  disable_account: { name: "disable_account", label: "Disable account", description: "Disable a hub user account.", risk: "medium", targets: ["account"] },
  scan_dataset: { name: "scan_dataset", label: "Scan dataset", description: "Deep-scan a dataset for malicious payloads.", risk: "read", targets: ["dataset"] },
  quarantine_dataset: { name: "quarantine_dataset", label: "Quarantine dataset", description: "Pull a dataset out of circulation.", risk: "medium", targets: ["dataset"] },
  inspect_worker: { name: "inspect_worker", label: "Inspect worker", description: "Inspect a dataset worker's env, loaders, processes.", risk: "read", targets: ["server"] },
  isolate_host: { name: "isolate_host", label: "Isolate host", description: "Network-isolate a host: deny all egress, drop sessions.", risk: "high", targets: ["server"] },
  block_egress: { name: "block_egress", label: "Block egress", description: "Block egress for a host or to a specific IP/subnet.", risk: "medium", targets: ["server", "subnet"] },
  cordon_cluster: { name: "cordon_cluster", label: "Cordon cluster", description: "Cordon a cluster: no new scheduling, east-west sealed.", risk: "high", targets: ["cluster"] },
  lock_registry: { name: "lock_registry", label: "Lock registry", description: "Lock the package/model registry: no installs, no token refresh.", risk: "high", targets: ["server"] },
  patch_service: { name: "patch_service", label: "Patch service", description: "Apply a known-CVE patch to a service.", risk: "medium", targets: ["server"] },
  harden_sandbox: { name: "harden_sandbox", label: "Harden sandbox", description: "Harden the eval sandbox: kill egress, tighten isolation.", risk: "low", targets: ["none"] },
  kill_process: { name: "kill_process", label: "Kill process", description: "Kill a suspicious process on a host.", risk: "medium", targets: ["server"] },
  rebuild_node: { name: "rebuild_node", label: "Rebuild node", description: "Rebuild a node from clean image.", risk: "destructive", targets: ["server"] },
  snapshot_evidence: { name: "snapshot_evidence", label: "Snapshot evidence", description: "Capture forensic snapshot of host state.", risk: "read", targets: ["server"] },
  enrich_ioc: { name: "enrich_ioc", label: "Enrich IOC", description: "Enrich an indicator against the knowledge base.", risk: "read", targets: ["ioc"] },
  map_attack: { name: "map_attack", label: "Map attack", description: "Reconstruct the kill chain for a threat.", risk: "read", targets: ["none"] },
  run_conformance: { name: "run_conformance", label: "Run conformance", description: "Run the role conformance checks on a host.", risk: "read", targets: ["server"] },
  remediate_drift: { name: "remediate_drift", label: "Remediate drift", description: "Auto-fix a failing config check.", risk: "low", targets: ["server"] },
  migrate_workload: { name: "migrate_workload", label: "Migrate workload", description: "Move workloads to another server.", risk: "destructive", targets: ["server", "workload"] },
  notify_human: { name: "notify_human", label: "Notify operator", description: "Text the operator.", risk: "read", targets: ["none"] },
  request_approval: { name: "request_approval", label: "Request approval", description: "Ask the operator to approve a gated action.", risk: "read", targets: ["none"] },
};

export const RISK_WEIGHT: Record<ToolRisk, number> = {
  read: 0,
  low: 10,
  medium: 25,
  high: 50,
  destructive: 80,
};

export const SEVERITY_WEIGHT: Record<string, number> = {
  info: 0.2,
  low: 0.4,
  medium: 0.6,
  high: 0.8,
  critical: 1,
};

export function toolSpec(name: ToolName): ToolSpec {
  return TOOL_SPECS[name];
}

export function isMutating(name: ToolName): boolean {
  return TOOL_SPECS[name].risk !== "read";
}
