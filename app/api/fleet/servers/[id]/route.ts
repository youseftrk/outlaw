import { rt, json, err } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { observe } from "@/server/world/world";

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
