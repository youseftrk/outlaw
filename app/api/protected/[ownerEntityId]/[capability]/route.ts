import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { authorize, entity, record } from "@/server/authority/engine";
import type { Capability } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ownerEntityId: string; capability: string }> };

const BodySchema = z.object({
  actorId: z.string().min(1),
  serverId: z.string().optional(),
  cluster: z.string().optional(),
});

const CAPS = new Set(["observe", "contain", "credentials", "data", "repair"]);

export async function POST(req: Request, { params }: Params) {
  rt();
  const { ownerEntityId, capability } = await params;
  if (!entity(ownerEntityId)) return err("owner entity not found", 404);
  if (!CAPS.has(capability)) return err("unknown capability", 404);
  const parsed = await parseBody(req, BodySchema);
  if ("error" in parsed) return parsed.error;
  const { actorId, serverId, cluster } = parsed.data;

  const result = authorize({ actorId, capability: capability as Capability, serverId, cluster, ownerEntityId });
  if (!result.allow) {
    record("refused", {
      actor: actorId,
      ownerEntityId,
      capability: capability as Capability,
      target: serverId ?? cluster ?? ownerEntityId,
      refusalCode: result.code,
      leaseId: result.lease?.id,
      checks: result.checks,
      summary: result.message,
    });
    return Response.json(
      { error: result.code, code: result.code, message: result.message, checks: result.checks, lease: result.lease },
      { status: 403 }
    );
  }
  record("allowed", {
    actor: actorId,
    leaseId: result.lease.id,
    requestingEntityId: result.lease.requestingEntityId,
    ownerEntityId,
    capability: capability as Capability,
    target: serverId ?? cluster ?? "estate",
    checks: result.checks,
    summary: `Protected call allowed under ${result.lease.id}.`,
  });
  return json({ ok: true, lease: result.lease, checks: result.checks });
}
