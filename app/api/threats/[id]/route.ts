import { rt, json, err } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const threat = store.threat(id);
  if (!threat) return err("threat not found", 404);
  const traces = threat.traceIds.map((t) => store.trace(t)).filter(Boolean);
  const messages = threat.messageIds.map((m) => store.s.messages.find((x) => x.id === m)).filter(Boolean);
  const servers = threat.targetServerIds.map((s) => store.server(s)).filter(Boolean);
  return json({ threat, traces, messages, servers });
}
