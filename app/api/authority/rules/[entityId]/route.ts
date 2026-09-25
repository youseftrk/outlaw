import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { entity, rulesFor, record } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ entityId: string }> };

const CAPS = ["observe", "contain", "credentials", "data", "repair"] as const;
const CLASSES = ["personal-data", "health-data", "financial-data", "security-telemetry", "infrastructure"] as const;

export async function GET(_req: Request, { params }: Params) {
  rt();
  const { entityId } = await params;
  if (!entity(entityId)) return err("entity not found", 404);
  return json(rulesFor(entityId));
}

const PatchSchema = z.object({
  by: z.string().min(1).default("operator"),
  allowed: z.array(z.enum(CAPS)).optional(),
  stepUp: z.array(z.enum(CAPS)).optional(),
  neverShared: z.array(z.enum(CLASSES)).optional(),
  maxDurationSec: z.number().int().positive().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  rt();
  const { entityId } = await params;
  if (!entity(entityId)) return err("entity not found", 404);
  const parsed = await parseBody(req, PatchSchema);
  if ("error" in parsed) return parsed.error;
  const { by, ...patch } = parsed.data;
  const rules = rulesFor(entityId);
  const idx = store.s.rules.findIndex((r) => r.entityId === entityId);
  if (idx < 0) store.s.rules.push(rules);
  Object.assign(store.s.rules.find((r) => r.entityId === entityId)!, patch);
  store.markDirty();
  record("rules-changed", {
    actor: by,
    ownerEntityId: entityId,
    summary: `The ${entity(entityId)!.name} updated its house rules.`,
    detail: patch,
  });
  return json(rulesFor(entityId));
}
