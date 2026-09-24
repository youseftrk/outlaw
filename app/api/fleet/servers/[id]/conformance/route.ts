import { rt, json, err } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { refreshServerConformance } from "@/server/fleet/conformance";
import { bus } from "@/server/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const server = store.server(id);
  if (!server) return err("server not found", 404);
  refreshServerConformance(server);
  bus.emit("server.updated", { server }, { summary: `conformance re-run on ${server.hostname} → ${server.conformanceScore}`, href: `/fleet?server=${server.id}` });
  return json({ server });
}
