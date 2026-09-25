import { rt, json } from "@/app/api/_lib/util";
import { drillState } from "@/server/authority/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  rt();
  return json(drillState());
}
