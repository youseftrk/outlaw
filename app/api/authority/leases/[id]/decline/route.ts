import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { decline } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({ by: z.string().min(1), reason: z.string().optional() }).default({ by: "operator" });

export async function POST(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const parsed = await parseBody(req, BodySchema).catch(() => ({ data: { by: "operator" as string } }));
  const data: { by: string; reason?: string } = "error" in parsed ? { by: "operator" } : parsed.data;
  const r = decline(id, data.by, data.reason);
  if (!r.ok) return Response.json({ error: r.message }, { status: r.status });
  return json(r.lease);
}
