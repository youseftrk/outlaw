import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";
import { TOOL_SPECS } from "@/server/agents/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  autonomy: z.enum(["observe", "recommend", "act-with-approval", "autonomous"]).optional(),
  status: z.enum(["idle", "paused"]).optional(),
  paused: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const agent = store.agent(id);
  if (!agent) return err("agent not found", 404);
  const tools = agent.tools.map((t) => TOOL_SPECS[t]);
  const threats = store.s.threats.filter((t) => t.handledBy.includes(agent.id));
  const traces = store.s.traces.filter((t) => t.agentId === agent.id).slice(-50);
  // SPEC §10: assigned ∪ protectedBy servers + this agent's thread (last 50)
  const serverIds = new Set([...agent.assignedServerIds, ...store.s.servers.filter((s) => s.protectedBy.includes(agent.id)).map((s) => s.id)]);
  const servers = store.s.servers.filter((s) => serverIds.has(s.id));
  const messages = store.s.messages.filter((m) => m.threadId === `thr-${agent.name.toLowerCase()}`).slice(-50);
  const events = store.s.events.filter((e) => e.agentId === agent.id).slice(-200);
  return json({ agent, tools, threats, traces, servers, messages, events });
}

export async function PATCH(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const agent = store.agent(id);
  if (!agent) return err("agent not found", 404);
  const parsed = await parseBody(req, PatchSchema);
  if ("error" in parsed) return parsed.error;
  if (parsed.data.autonomy) agent.autonomy = parsed.data.autonomy;
  if (parsed.data.status) agent.status = parsed.data.status;
  if (parsed.data.paused !== undefined) agent.status = parsed.data.paused ? "paused" : "idle";
  store.markDirty();
  bus.emit("agent.status", { agent }, { agentId: agent.id, summary: `${agent.name} → ${agent.autonomy}/${agent.status}`, href: `/agents/${agent.id}` });
  return json({ agent });
}
