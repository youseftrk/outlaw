import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  effect: z.enum(["allow", "deny", "require-approval"]).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const policy = store.s.policies.find((p) => p.id === id);
  if (!policy) return err("policy not found", 404);
  const parsed = await parseBody(req, PatchSchema);
  if ("error" in parsed) return parsed.error;
  Object.assign(policy, parsed.data, { updatedAt: store.now() });
  store.markDirty();
  bus.emit("policy.updated", { policy }, { summary: `policy ${id} updated`, href: "/governance" });
  return json({ policy });
}

export async function DELETE(_req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const idx = store.s.policies.findIndex((p) => p.id === id);
  if (idx === -1) return err("policy not found", 404);
  const [policy] = store.s.policies.splice(idx, 1);
  store.markDirty();
  bus.emit("policy.updated", { policy, deleted: true }, { summary: `policy ${id} deleted`, href: "/governance" });
  return json({ ok: true });
}
