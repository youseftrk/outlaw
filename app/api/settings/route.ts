import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";
import { LLM_PRESETS } from "@/server/agents/llm";
import { configureDelivery, redactedDelivery } from "@/server/messaging/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  rt();
  const s = store.s.settings;
  return json({
    ...s,
    llm: { ...s.llm, apiKeySet: !!store.secrets.llmApiKey },
    delivery: redactedDelivery(),
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
  delivery: z.object({
    channel: z.enum(["off", "webhook", "slack", "twilio"]).optional(),
    url: z.string().optional(),
    twilio: z.object({ accountSid: z.string().optional(), from: z.string().optional(), to: z.string().optional() }).optional(),
    filter: z.object({
      minSeverity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
      kinds: z.array(z.enum(["text", "alert", "approval-request", "report", "status", "system"])).optional(),
      agentIds: z.array(z.string()).optional(),
    }).optional(),
    secret: z.string().optional(), // write-only → .data/secrets.json
    twilioAuthToken: z.string().optional(), // write-only → .data/secrets.json
  }).optional(),
});

export async function PATCH(req: Request) {
  rt();
  const parsed = await parseBody(req, PatchSchema);
  if ("error" in parsed) return parsed.error;
  const s = store.s.settings;
  const { llm, operator, sim, delivery } = parsed.data;
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
  if (delivery) configureDelivery(delivery);
  store.markDirty();
  const redacted = { ...s, llm: { ...s.llm, apiKeySet: !!store.secrets.llmApiKey }, delivery: redactedDelivery() };
  bus.emit("system", { settings: redacted }, { summary: "settings updated", href: "/settings" });
  return json({ settings: redacted });
}
