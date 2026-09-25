import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";
import { observe } from "@/server/world/world";
import { setSshTarget } from "@/server/fleet/adapters/ssh-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const server = store.server(id);
  if (!server) return err("server not found", 404);
  const world = observe();
  const threats = store.s.threats.filter((t) => t.targetServerIds.includes(server.id));
  const migrations = store.s.migrations.filter((m) => m.sourceServerId === server.id || m.targetServerId === server.id);
  const worker = world.workers.find((w) => w.serverId === server.id);
  const cluster = world.clusters.find((c) => c.nodeServerIds.includes(server.id));
  return json({ server, threats, migrations, worker, cluster });
}

const PatchSchema = z.object({
  adapter: z.enum(["sim", "ssh"]).optional(),
  /** reachable `host[:port]`; "" removes the mapping */
  sshTarget: z.string().max(260).optional(),
});

/** Flip a server between the simulated world and a real host, and map it to a reachable address (feeds `hostMap`). */
export async function PATCH(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const server = store.server(id);
  if (!server) return err("server not found", 404);
  const parsed = await parseBody(req, PatchSchema);
  if ("error" in parsed) return parsed.error;
  const { adapter, sshTarget } = parsed.data;
  if (adapter !== undefined) {
    if (adapter === "sim") delete server.adapter;
    else server.adapter = adapter;
  }
  if (sshTarget !== undefined) {
    const target = sshTarget.trim() || undefined;
    if (target) server.sshTarget = target;
    else delete server.sshTarget;
    setSshTarget(server.id, target);
  }
  store.markDirty();
  bus.emit("server.updated", { serverId: server.id, adapter: server.adapter ?? "sim", sshTarget: server.sshTarget }, {
    summary: `${server.hostname} → ${server.adapter ?? "sim"} adapter${server.sshTarget ? ` (${server.sshTarget})` : ""}`,
    href: `/fleet?server=${server.id}`,
  });
  return json({ server });
}
