/**
 * Conformance check catalogue per role (SPEC §6.1), scoring, remediation
 * mapping. Score = 100 − Σ(fail 12, warn 4), clamped ≥ 0.
 */
import type {
  ConformanceCategory,
  ConformanceCheck,
  Server,
  ServerRole,
  ToolName,
  ISODate,
} from "@/lib/types";
import { observe } from "../world/world";
import type { ObservedWorld } from "../world/world";
import { store } from "../store";

export interface CheckTemplate {
  key: string;
  name: string;
  category: ConformanceCategory;
  autoRemediable: boolean;
  remediationTool?: ToolName;
  roles: ServerRole[] | "all";
}

export const CHECK_CATALOG: CheckTemplate[] = [
  // patching
  { key: "kernel-current", name: "Kernel is within one minor release", category: "patching", autoRemediable: true, remediationTool: "patch_service", roles: "all" },
  { key: "service-versions", name: "Service packages on latest stable", category: "patching", autoRemediable: true, remediationTool: "patch_service", roles: "all" },
  { key: "known-cves", name: "No unpatched known CVEs", category: "patching", autoRemediable: true, remediationTool: "patch_service", roles: "all" },
  // network
  { key: "egress-policy", name: "Egress policy matches baseline", category: "network", autoRemediable: true, remediationTool: "block_egress", roles: "all" },
  { key: "east-west", name: "East-west segmentation enforced", category: "network", autoRemediable: false, roles: ["k8s-node", "control-plane", "database"] },
  { key: "exposed-ports", name: "No unexpected public listeners", category: "network", autoRemediable: false, roles: "all" },
  { key: "imds-v2", name: "Instance metadata requires IMDSv2", category: "network", autoRemediable: true, remediationTool: "remediate_drift", roles: "all" },
  // identity
  { key: "mfa-admins", name: "Privileged accounts have MFA", category: "identity", autoRemediable: false, roles: "all" },
  { key: "token-hygiene", name: "No long-lived write tokens", category: "identity", autoRemediable: true, remediationTool: "revoke_token", roles: "all" },
  { key: "admin-sessions", name: "No stale admin sessions", category: "identity", autoRemediable: false, roles: ["registry", "control-plane", "database", "scm"] },
  // config
  { key: "plugin-install-off", name: "Plugin installation disabled", category: "config", autoRemediable: true, remediationTool: "remediate_drift", roles: ["registry"] },
  { key: "remote-code-loaders-off", name: "Remote-code dataset loaders disabled", category: "config", autoRemediable: true, remediationTool: "remediate_drift", roles: ["worker"] },
  { key: "template-sandboxing", name: "Template sandboxing enforced", category: "config", autoRemediable: true, remediationTool: "patch_service", roles: ["worker", "ci"] },
  { key: "signed-artifacts", name: "Artifact signature verification on", category: "config", autoRemediable: false, roles: ["registry", "ci", "scm"] },
  // runtime
  { key: "edr-heartbeat", name: "EDR agent heartbeating", category: "runtime", autoRemediable: false, roles: "all" },
  { key: "container-escape-mitigations", name: "Container escape mitigations on", category: "runtime", autoRemediable: false, roles: ["k8s-node"] },
  { key: "audit-logging", name: "Auditd / process logging active", category: "runtime", autoRemediable: false, roles: "all" },
  // data
  { key: "encryption-at-rest", name: "Encryption at rest enabled", category: "data", autoRemediable: false, roles: "all" },
  { key: "no-public-bucket", name: "No public object buckets", category: "data", autoRemediable: true, remediationTool: "remediate_drift", roles: ["storage"] },
  { key: "dataset-secret-scan", name: "Dataset secret scanning enabled", category: "data", autoRemediable: false, roles: ["worker", "storage", "api"] },
  { key: "backup-recency", name: "Backups fresh (<24h)", category: "data", autoRemediable: false, roles: ["database", "storage"] },
  // role extras
  { key: "fail2ban", name: "Brute-force rate limiting active", category: "network", autoRemediable: true, remediationTool: "remediate_drift", roles: ["bastion", "vpn"] },
  { key: "prompt-injection-filter", name: "Prompt-injection filter enabled", category: "runtime", autoRemediable: true, remediationTool: "patch_service", roles: ["inference"] },
  { key: "model-signing", name: "Model artifacts signature-checked", category: "config", autoRemediable: false, roles: ["inference", "registry"] },
];

export function catalogForRole(role: ServerRole): CheckTemplate[] {
  return CHECK_CATALOG.filter((c) => c.roles === "all" || c.roles.includes(role));
}

/** Evaluate the catalogue against world truth + server record. */
export function evaluateChecks(srv: Server, at: ISODate, obs?: ObservedWorld): ConformanceCheck[] {
  const world = obs ?? observe();
  const worker = world.workers.find((w) => w.serverId === srv.id);
  const isRegistry = world.registry.serverId === srv.id;
  const weakAccounts = world.accounts.filter((a) => !a.mfa).length;
  const exposedTokens = world.tokens.filter((t) => t.revealedExposedInDatasetId && !t.revoked).length;

  return catalogForRole(srv.role).map((tpl) => {
    let status: ConformanceCheck["status"] = "pass";
    let detail = "within baseline";

    switch (tpl.key) {
      case "kernel-current":
        if (srv.status === "compromised") { status = "warn"; detail = "host compromised — cannot attest kernel"; }
        break;
      case "service-versions":
        if (isRegistry && !world.registry.patched) { status = "warn"; detail = `registry on ${world.registry.version}`; }
        break;
      case "known-cves":
        // The token-refresh signature bypass is a true zero-day and is NEVER
        // revealed by conformance (SPEC §3.2) — only the known CVE classes.
        if (worker && !worker.fileDisclosurePatched) { status = "fail"; detail = "CVE-2026-31415 dataset file disclosure unpatched"; }
        else if (worker && !worker.templateInjectionPatched) { status = "fail"; detail = "CVE-2026-29887 Jinja2 SSTI unpatched"; }
        break;
      case "egress-policy":
        if (!world.network.egressAllowed[srv.id]) { status = "pass"; detail = "egress restricted"; }
        else if (srv.env === "sandbox" || world.sandbox.egressAllowed && srv.cluster === "eval-gym") { status = "warn"; detail = "egress open"; }
        break;
      case "east-west":
        {
          const cl = world.clusters.find((c) => c.nodeServerIds.includes(srv.id));
          if (cl?.eastWestOpen) { status = "warn"; detail = `east-west open on ${cl.name}`; }
        }
        break;
      case "exposed-ports":
        if (srv.role === "registry" || srv.role === "bastion") { status = "pass"; detail = "expected listeners only"; }
        break;
      case "imds-v2":
        if (srv.provider === "aws" && (srv.role === "worker" || srv.role === "k8s-node")) { status = "warn"; detail = "IMDSv1 still reachable"; }
        break;
      case "mfa-admins":
        if (weakAccounts > 0) { status = "warn"; detail = `${weakAccounts} privileged account(s) without MFA`; }
        break;
      case "token-hygiene":
        if (exposedTokens > 0) { status = "fail"; detail = `${exposedTokens} token(s) exposed in public datasets`; }
        else if (world.tokens.some((t) => t.scope !== "read" && !t.revoked && !t.lastUsedAt)) { status = "warn"; detail = "long-lived write tokens unused >30d"; }
        break;
      case "plugin-install-off":
        if (isRegistry && world.registry.pluginInstallAllowed) { status = "fail"; detail = "plugin installs allowed on registry"; }
        break;
      case "remote-code-loaders-off":
        if (worker) {
          const remote = world.datasets.filter((d) => d.loader === "remote-code").length;
          if (remote > 0) { status = "warn"; detail = `${remote} dataset(s) use remote-code loaders`; }
        }
        break;
      case "template-sandboxing":
        if (worker && !worker.templateInjectionPatched) { status = "fail"; detail = "template sandbox disabled"; }
        break;
      case "container-escape-mitigations":
        {
          const cl = world.clusters.find((c) => c.nodeServerIds.includes(srv.id));
          if (cl?.name === "eval-gym") { status = "warn"; detail = "eval sandbox tolerates escapes"; }
        }
        break;
      case "dataset-secret-scan":
        if (exposedTokens > 0) { status = "fail"; detail = "secrets found in public datasets"; }
        break;
      case "no-public-bucket":
        // public datasets are the product — pass by default
        break;
      default:
        break;
    }

    return {
      id: `${srv.id}:${tpl.key}`,
      name: tpl.name,
      category: tpl.category,
      status,
      detail,
      checkedAt: at,
      autoRemediable: tpl.autoRemediable,
      remediationTool: tpl.remediationTool,
    };
  });
}

export function conformanceScore(checks: ConformanceCheck[]): number {
  const penalty = checks.reduce(
    (acc, c) => acc + (c.status === "fail" ? 12 : c.status === "warn" ? 4 : 0),
    0
  );
  return Math.max(0, 100 - penalty);
}

/** Re-run checks on one server and update its record. */
export function refreshServerConformance(srv: Server): void {
  srv.checks = evaluateChecks(srv, store.now());
  srv.conformanceScore = conformanceScore(srv.checks);
  store.markDirty();
}
