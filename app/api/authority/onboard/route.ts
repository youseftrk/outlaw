import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { onboardSystem } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  serverId: z.string().min(1),
  ownerEntityId: z.string().min(1),
  dataClasses: z.array(z.enum(["personal-data", "health-data", "financial-data", "security-telemetry", "infrastructure"])).optional(),
  by: z.string().min(1).optional(),
});

/** Put a system under an owner. From here on, other entities' agents need that owner's permission to touch it. */
export async function POST(req: Request) {
  rt();
  const parsed = await parseBody(req, BodySchema);
  if ("error" in parsed) return parsed.error;
  const { by, ...input } = parsed.data;
  const r = onboardSystem(input, by ?? input.ownerEntityId);
  if (!r.ok) return Response.json({ error: r.code, message: r.message }, { status: r.code === "NOT_FOUND" ? 404 : 400 });
  return json({ server: r.server, record: r.record });
}
