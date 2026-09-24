/** Shared helpers for route handlers. Private folder — not routed. */
import { z } from "zod";
import { getRuntime } from "@/server/runtime";

export function rt() {
  return getRuntime();
}

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function err(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

/** Parse JSON body against a zod schema; returns {data} or Response error. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S
): Promise<{ data: z.infer<S> } | { error: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: err("invalid JSON body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: err(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")) };
  }
  return { data: parsed.data };
}
