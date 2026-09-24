import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  rt();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const severity = url.searchParams.get("severity");
  const server = url.searchParams.get("server");
  const open = url.searchParams.get("open");
  let threats = [...store.s.threats].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  if (status) threats = threats.filter((t) => t.status === status);
  if (severity) threats = threats.filter((t) => t.severity === severity);
  if (server) threats = threats.filter((t) => t.targetServerIds.includes(server));
  if (open === "true") threats = threats.filter((t) => !["neutralized", "prevented", "false-positive"].includes(t.status));
  return json({ threats });
}
