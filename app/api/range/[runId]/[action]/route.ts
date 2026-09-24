import { z } from "zod";
import { rt, json, err } from "@/app/api/_lib/util";
import { rangeAction } from "@/server/range/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ runId: string; action: string }> };

const BodySchema = z.object({ speed: z.number().min(1).max(8).optional() }).optional();

export async function POST(req: Request, { params }: Params) {
  rt();
  const { runId, action } = await params;
  if (!["pause", "resume", "abort", "speed"].includes(action)) return err(`unknown action ${action}`);
  let speed: number | undefined;
  if (action === "speed") {
    const raw = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return err("invalid body");
    speed = parsed.data?.speed;
  }
  const res = rangeAction(runId, action as "pause" | "resume" | "abort" | "speed", speed);
  if (!res.ok) return err(res.error ?? "action failed");
  return json({ ok: true });
}
