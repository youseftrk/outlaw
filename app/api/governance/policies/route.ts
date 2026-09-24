import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";
import { nextId } from "@/server/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  rt();
  return json({ policies: [...store.s.policies].sort((a, b) => a.priority - b.priority) });
}

const CreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  effect: z.enum(["allow", "deny", "require-approval"]),
  priority: z.number().int().optional(),
  match: z.object({
    tools: z.array(z.string()).optional(),
    risk: z.array(z.enum(["read", "low", "medium", "high", "destructive"])).optional(),
    minSeverity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
    serverTags: z.array(z.string()).optional(),
    environments: z.array(z.enum(["prod", "staging", "research", "sandbox"])).optional(),
    agentRoles: z.array(z.string()).optional(),
    timeWindow: z.enum(["any", "business-hours", "after-hours", "weekend"]).optional(),
  }).default({}),
});

export async function POST(req: Request) {
  rt();
  const parsed = await parseBody(req, CreateSchema);
  if ("error" in parsed) return parsed.error;
  const now = store.now();
  const policy = {
    id: nextId("pol-custom-"),
    name: parsed.data.name,
    description: parsed.data.description,
    effect: parsed.data.effect,
    enabled: true,
    priority: parsed.data.priority ?? store.s.policies.length + 1,
    match: parsed.data.match as never,
    hits: 0,
    createdAt: now,
    updatedAt: now,
  };
  store.s.policies.push(policy);
  store.markDirty();
  bus.emit("policy.updated", { policy }, { summary: `policy created: ${policy.name}`, href: "/governance" });
  return json({ policy }, { status: 201 });
}
