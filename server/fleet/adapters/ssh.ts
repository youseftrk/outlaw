/**
 * SshAdapter — documented skeleton for real host access (SPEC §4).
 *
 * Config shape (would live in .data/secrets.json / settings):
 * ```ts
 * interface SshAdapterConfig {
 *   user: string;                 // e.g. "qalaa-agent"
 *   keyRef: string;               // secret id holding the ed25519 private key
 *   port?: number;                // default 22
 *   bastion?: { host: string; user: string; keyRef: string };
 *   hostKeyPolicy: "strict" | "accept-new";
 *   sudo?: boolean;               // wrap commands in sudo -n
 *   timeoutMs?: number;           // per-command timeout, default 15000
 *   hostMap?: Record<string, string>; // serverId -> reachable IP/DNS
 * }
 * ```
 * Implementation notes for whoever wires this up:
 * - dial via a hardened `ssh2`/paramiko-equivalent with `hostKeyPolicy` enforced
 * - every `exec`/`applyPatch` writes the exact argv to the `tool` span
 * - `isolate` = apply an egress-deny nftables set + drop established conns
 * - `release` = remove that set
 * - `rotateSecret` = write to the host's secret manager agent socket
 * - `snapshot` = `qalaa-agent collect --quick` tarball to object storage
 * - `migrate` = drain workloads via the orchestrator API, not raw ssh
 */
import type { ID } from "@/lib/types";
import type { Actor } from "../../world/world";
import type { AdapterResult, ServerAdapter } from "./types";

export class SshAdapter implements ServerAdapter {
  readonly kind = "ssh" as const;

  private notConfigured(cmd: string): AdapterResult {
    return {
      ok: false,
      summary: "ssh adapter not configured — set an SshAdapterConfig (see JSDoc in server/fleet/adapters/ssh.ts)",
      command: cmd,
    };
  }

  async exec(_serverId: ID, cmd: string): Promise<AdapterResult> {
    return this.notConfigured(cmd);
  }
  async readConfig(_serverId: ID, path: string): Promise<AdapterResult> {
    return this.notConfigured(`cat ${path}`);
  }
  async applyPatch(_serverId: ID, patchId: string): Promise<AdapterResult> {
    return this.notConfigured(`patch ${patchId}`);
  }
  async isolate(_serverId: ID): Promise<AdapterResult> {
    return this.notConfigured("isolate");
  }
  async release(_serverId: ID): Promise<AdapterResult> {
    return this.notConfigured("release");
  }
  async rotateSecret(_serverId: ID, secretRef: string): Promise<AdapterResult> {
    return this.notConfigured(`rotate-secret ${secretRef}`);
  }
  async snapshot(_serverId: ID): Promise<AdapterResult> {
    return this.notConfigured("snapshot");
  }
  async migrate(sourceId: ID, _targetId: ID | undefined, _workloads: string[]): Promise<AdapterResult> {
    return this.notConfigured(`migrate ${sourceId}`);
  }
}
