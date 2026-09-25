import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { accept } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({ by: z.string().min(1), reason: z.string().optional() }).default({ by: "operator" });

export async function POST(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const parsed = await parseBody(req, BodySchema).catch(() => ({ data: { by: "operator" as string } }));
  const by = "error" in parsed ? "operator" : parsed.data.by;
  const r = accept(id, by);
  if (!r.ok) return Response.json({ error: r.message }, { status: r.status });
  // stepUpCode stays server-internal; only surfaced in dev demo mode (QALAA_DEMO_SHOW_CODE=1)
  const lease: Record<string, unknown> = { ...r.lease };
  if (process.env.QALAA_DEMO_SHOW_CODE === "1" && r.stepUpCode) lease.stepUpCode = r.stepUpCode;
  return json(lease);
}
