import { z } from "zod";
import { rt, json, err, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { createMigration } from "@/server/fleet/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  rt();
  return json({ migrations: [...store.s.migrations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}

const CreateSchema = z.object({
  sourceServerId: z.string().min(1),
  targetServerId: z.string().optional(),
  targetSpec: z.object({
    provider: z.enum(["aws", "gcp", "azure", "hetzner", "on-prem"]).optional(),
    region: z.string().optional(),
    role: z.string().optional(),
  }).optional(),
  reason: z.enum(["capacity", "cost", "compliance", "incident-response"]).default("capacity"),
  workloads: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  rt();
  const parsed = await parseBody(req, CreateSchema);
  if ("error" in parsed) return parsed.error;
  if (!store.server(parsed.data.sourceServerId)) return err("source server not found", 404);
  const mig = createMigration(parsed.data as Parameters<typeof createMigration>[0]);
  return json({ migration: mig }, { status: 201 });
}
