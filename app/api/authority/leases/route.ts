import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { request } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  rt();
  const q = new URL(req.url).searchParams;
  let leases = store.s.leases;
  const status = q.get("status");
  const ownerEntityId = q.get("ownerEntityId");
  const requestingEntityId = q.get("requestingEntityId");
  if (status) leases = leases.filter((l) => l.status === status);
  if (ownerEntityId) leases = leases.filter((l) => l.ownerEntityId === ownerEntityId);
  if (requestingEntityId) leases = leases.filter((l) => l.requestingEntityId === requestingEntityId);
  return json(leases);
}

const RequestSchema = z.object({
  requestingEntityId: z.string().min(1),
  ownerEntityId: z.string().min(1),
  agentId: z.string().optional(),
  capability: z.enum(["observe", "contain", "credentials", "data", "repair"]),
  scope: z
    .object({
      serverIds: z.array(z.string()).optional(),
      clusters: z.array(z.string()).optional(),
      envs: z.array(z.enum(["prod", "staging", "research", "sandbox"])).optional(),
    })
    .default({}),
  justification: z.string().min(1),
  incidentId: z.string().optional(),
  durationSec: z.number().int().positive().max(7 * 86400),
});

export async function POST(req: Request) {
  rt();
  const parsed = await parseBody(req, RequestSchema);
  if ("error" in parsed) return parsed.error;
  const d = parsed.data;
  const result = request(
    {
      requestingEntityId: d.requestingEntityId,
      ownerEntityId: d.ownerEntityId,
      agentId: d.agentId,
      capability: d.capability,
      scope: d.scope,
      justification: d.justification,
      incidentId: d.incidentId,
      durationSec: d.durationSec,
    },
    "operator"
  );
  if (!result.ok) return Response.json({ error: result.message, code: result.code }, { status: result.status });
  return json(result.lease, { status: result.created ? 201 : 200 });
}
