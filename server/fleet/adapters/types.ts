/**
 * ServerAdapter — the seam between agent tools and real hosts (SPEC §4).
 * Every call is recorded as a `tool` trace span with the exact command/plan
 * that would run on the host.
 */
import type { ID } from "@/lib/types";
import type { Actor } from "../../world/world";

export interface AdapterResult {
  ok: boolean;
  summary: string;
  /** the exact command or plan that ran (or would run) on the host */
  command: string;
  evidence?: Record<string, unknown>;
}

export interface ServerAdapter {
  readonly kind: "sim" | "ssh";
  exec(serverId: ID, cmd: string, by?: Actor): Promise<AdapterResult>;
  readConfig(serverId: ID, path: string, by?: Actor): Promise<AdapterResult>;
  applyPatch(serverId: ID, patchId: string, by?: Actor): Promise<AdapterResult>;
  isolate(serverId: ID, by?: Actor): Promise<AdapterResult>;
  release(serverId: ID, by?: Actor): Promise<AdapterResult>;
  rotateSecret(serverId: ID, secretRef: string, by?: Actor): Promise<AdapterResult>;
  snapshot(serverId: ID, by?: Actor): Promise<AdapterResult>;
  migrate(sourceId: ID, targetId: ID | undefined, workloads: string[], by?: Actor): Promise<AdapterResult>;
}
