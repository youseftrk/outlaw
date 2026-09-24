import { rt, json } from "@/app/api/_lib/util";
import { CVES, TECHNIQUES, ACTORS, searchKB } from "@/server/research/kb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  rt();
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const type = url.searchParams.get("type") as "cve" | "technique" | "actor" | null;
  if (q) return json(searchKB(q, type ?? undefined));
  return json({ cves: CVES, techniques: TECHNIQUES, actors: ACTORS });
}
