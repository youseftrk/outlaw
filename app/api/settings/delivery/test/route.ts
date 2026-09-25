import { rt, json } from "@/app/api/_lib/util";
import { deliveryTest } from "@/server/messaging/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  rt();
  const result = await deliveryTest();
  return json(result, { status: result.ok ? 200 : 502 });
}
