import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";
import { LLM_PRESETS } from "@/server/agents/llm";
import { authEnabled, authSource } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  rt();
  const s = store.s.settings;
  return json({
    ...s,
    llm: { ...s.llm, apiKeySet: !!store.secrets.llmApiKey },
    auth: { enabled: authEnabled(), source: authSource() },
    llmPresets: LLM_PRESETS,
  });
}

const PatchSchema = z.object({
  llm: z.object({
    provider: z.enum(["none", "groq", "gemini", "mistral", "cerebras", "openrouter", "huggingface", "custom"]).optional(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    enabled: z.boolean().optional(),
    apiKey: z.string().optional(), // write-only → .data/secrets.json
  }).optional(),
  operator: z.object({ name: z.string().optional(), phone: z.string().optional(), org: z.string().optional() }).optional(),
  sim: z.object({ speed: z.number().min(0.25).max(16).optional(), autoRun: z.boolean().optional(), quietHours: z.boolean().optional() }).optional(),
});

export async function PATCH(req: Request) {
  rt();
  const parsed = await parseBody(req, PatchSchema);
  if ("error" in parsed) return parsed.error;
  const s = store.s.settings;
  const { llm, operator, sim } = parsed.data;
  if (llm) {
    const { apiKey, ...rest } = llm;
    const presetKey = rest.provider as keyof typeof LLM_PRESETS | undefined;
    if (presetKey && LLM_PRESETS[presetKey]) {
      const preset = LLM_PRESETS[presetKey];
      if (!rest.baseUrl) rest.baseUrl = preset.baseUrl;
      if (!rest.model) rest.model = preset.model;
    }
    Object.assign(s.llm, rest);
    if (apiKey !== undefined) {
      store.secrets.llmApiKey = apiKey || undefined;
      store.saveSecrets();
    }
    s.llm.apiKeySet = !!store.secrets.llmApiKey;
  }
  if (operator) Object.assign(s.operator, operator);
  if (sim) Object.assign(s.sim, sim);
  store.markDirty();
  bus.emit("system", { settings: s }, { summary: "settings updated", href: "/settings" });
  return json({ settings: { ...s, llm: { ...s.llm, apiKeySet: !!store.secrets.llmApiKey }, auth: { enabled: authEnabled(), source: authSource() } } });
}
