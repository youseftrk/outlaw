import { rt, json } from "@/app/api/_lib/util";
import { llmTest } from "@/server/agents/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  rt();
  const result = await llmTest();
  return json(result, { status: result.ok ? 200 : 502 });
}
