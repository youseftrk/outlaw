import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { runDirector } from "@/server/range/director";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  scenario: z.enum(["brute-force", "c2-beacon", "exfil", "prompt-injection", "leaked-token", "reset-demo"]),
});

export async function POST(req: Request) {
  rt();
  const parsed = await parseBody(req, Schema);
  if ("error" in parsed) return parsed.error;
  const res = runDirector(parsed.data.scenario);
  if (parsed.data.scenario === "reset-demo" && res.ok) {
    getRuntime().reset();
  }
  if (!res.ok) return err(res.message);
  return json(res);
}
