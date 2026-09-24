import { rt, json } from "@/app/api/_lib/util";
import { store } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  rt();
  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  const env = url.searchParams.get("env");
  const status = url.searchParams.get("status");
  let servers = store.s.servers;
  if (role) servers = servers.filter((s) => s.role === role);
  if (env) servers = servers.filter((s) => s.env === env);
  if (status) servers = servers.filter((s) => s.status === status);
  return json({ servers });
}
