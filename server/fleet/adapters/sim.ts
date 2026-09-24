/** SimAdapter — default adapter; mutates the world model. */
import type { ID } from "@/lib/types";
import * as world from "../../world/world";
import type { Actor } from "../../world/world";
import { store } from "../../store";
import type { AdapterResult, ServerAdapter } from "./types";

export class SimAdapter implements ServerAdapter {
  readonly kind = "sim" as const;

  async exec(serverId: ID, cmd: string): Promise<AdapterResult> {
    const srv = store.server(serverId);
    if (!srv) return { ok: false, summary: `server ${serverId} not found`, command: cmd };
    return { ok: true, summary: `ran \`${cmd}\` on ${srv.hostname}`, command: cmd };
  }

  async readConfig(serverId: ID, path: string): Promise<AdapterResult> {
    const srv = store.server(serverId);
    if (!srv) return { ok: false, summary: `server ${serverId} not found`, command: `cat ${path}` };
    return {
      ok: true,
      summary: `read ${path} on ${srv.hostname}`,
      command: `cat ${path}`,
      evidence: { path, host: srv.hostname },
    };
  }

  async applyPatch(serverId: ID, patchId: string, by?: Actor): Promise<AdapterResult> {
    const srv = store.server(serverId);
    if (!srv) return { ok: false, summary: `server ${serverId} not found`, command: `patch ${patchId}` };
    const r = world.observe().registry;
    let res: { ok: boolean; summary: string };
    if (srv.role === "registry") {
      res = world.patchRegistry(by);
    } else if (srv.role === "worker") {
      res = world.patchWorker(srv.id, "all", by);
    } else {
      res = { ok: true, summary: `applied ${patchId} on ${srv.hostname}` };
    }
    return { ...res, command: `outlaw-agent apply-patch ${patchId}` };
  }

  async isolate(serverId: ID, by?: Actor): Promise<AdapterResult> {
    const res = world.isolateHost(serverId, by);
    return { ...res, command: `outlaw-agent isolate ${serverId}` };
  }

  async release(serverId: ID, by?: Actor): Promise<AdapterResult> {
    const res = world.releaseHost(serverId, by);
    return { ...res, command: `outlaw-agent release ${serverId}` };
  }

  async rotateSecret(serverId: ID, secretRef: string, by?: Actor): Promise<AdapterResult> {
    const res = serverId === "*" ? world.rotateSecret(secretRef, by) : world.rotateSecretsForServer(serverId, by);
    return { ...res, command: `outlaw-agent rotate-secret ${secretRef}` };
  }

  async snapshot(serverId: ID): Promise<AdapterResult> {
    const srv = store.server(serverId);
    if (!srv) return { ok: false, summary: `server ${serverId} not found`, command: "snapshot" };
    return {
      ok: true,
      summary: `snapshot of ${srv.hostname} captured`,
      command: `outlaw-agent snapshot ${srv.hostname}`,
      evidence: { serverId: srv.id, status: srv.status, at: store.now() },
    };
  }

  async migrate(sourceId: ID, _targetId: ID | undefined, workloads: string[]): Promise<AdapterResult> {
    const src = store.server(sourceId);
    if (!src) return { ok: false, summary: `server ${sourceId} not found`, command: "migrate" };
    return {
      ok: true,
      summary: `migrated ${workloads.length} workload(s) off ${src.hostname}`,
      command: `outlaw-agent migrate ${src.hostname} ${workloads.join(",")}`,
    };
  }
}
