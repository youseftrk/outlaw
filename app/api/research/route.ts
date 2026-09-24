import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { runResearch } from "@/server/research/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AskSchema = z.object({
  query: z.string().min(2),
  kind: z.enum(["ioc", "cve", "technique", "actor", "freeform"]).optional(),
});

export async function POST(req: Request) {
  rt();
  const parsed = await parseBody(req, AskSchema);
  if ("error" in parsed) return parsed.error;
  const query = await runResearch(parsed.data.query, parsed.data.kind);
  return json({ query }, { status: 202 });
}
