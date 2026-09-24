import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { startRun } from "@/server/range/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RunSchema = z.object({
  scenarioId: z.string().min(1),
  mode: z.enum(["protected", "baseline"]).default("protected"),
  speed: z.number().min(1).max(8).default(1),
});

export async function POST(req: Request) {
  rt();
  const parsed = await parseBody(req, RunSchema);
  if ("error" in parsed) return parsed.error;
  const run = startRun(parsed.data.scenarioId, parsed.data.mode, parsed.data.speed);
  if ("error" in run) return err(run.error);
  return json({ run }, { status: 201 });
}
