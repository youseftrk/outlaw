import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { completeStepUp } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const parsed = await parseBody(req, BodySchema);
  if ("error" in parsed) return parsed.error;
  const r = completeStepUp(id, parsed.data.code, "operator");
  if (!r.ok) return Response.json({ error: r.message, code: r.status === 403 ? "STEP_UP_REQUIRED" : undefined }, { status: r.status });
  return json(r.lease);
}
