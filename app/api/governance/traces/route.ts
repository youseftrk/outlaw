import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  rt();
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const threatId = url.searchParams.get("threatId");
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));
  let traces = [...store.s.traces].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (agentId) traces = traces.filter((t) => t.agentId === agentId);
  if (threatId) traces = traces.filter((t) => t.threatId === threatId);
  return json({ traces: traces.slice(0, limit) });
}
