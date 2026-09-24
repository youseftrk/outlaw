import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { decide } from "@/server/governance/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const DecideSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

export async function POST(req: Request, { params }: Params) {
  rt();
  const { id } = await params;
  const parsed = await parseBody(req, DecideSchema);
  if ("error" in parsed) return parsed.error;
  const approval = decide(id, parsed.data.decision, "operator");
  if (!approval) return err("approval not found", 404);
  return json({ approval });
}
