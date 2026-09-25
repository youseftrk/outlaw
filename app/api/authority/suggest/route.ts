import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { suggest } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SuggestSchema = z
  .object({
    incidentId: z.string().optional(),
    agentId: z.string().optional(),
    capability: z.enum(["observe", "contain", "credentials", "data", "repair"]).optional(),
    serverId: z.string().optional(),
  })
  .refine((d) => d.incidentId || (d.agentId && d.capability && d.serverId), {
    message: "pass incidentId or {agentId, capability, serverId}",
  });

export async function POST(req: Request) {
  rt();
  const parsed = await parseBody(req, SuggestSchema);
  if ("error" in parsed) return parsed.error;
  const r = suggest(parsed.data);
  if ("error" in r) return err(r.error, 404);
  return json(r);
}
