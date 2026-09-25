import { z } from "zod";
import { rt, json, parseBody } from "@/app/api/_lib/util";
import { store } from "@/server/store";
import { bus } from "@/server/bus";
import { LLM_PRESETS } from "@/server/agents/llm";
import { applySshSettingsPatch, sshSettingsView } from "@/server/fleet/adapters/ssh-config";
import { authEnabled, authSource } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings as the client may see them: secrets replaced by booleans/counts. */
function redacted() {
  const s = store.s.settings;
  return {
    ...s,
    llm: { ...s.llm, apiKeySet: !!store.secrets.llmApiKey },
    ssh: sshSettingsView(s.ssh),
    auth: { enabled: authEnabled(), source: authSource() },
  };
}

export async function GET() {
  rt();
  return json({ ...redacted(), llmPresets: LLM_PRESETS });
}

const PatchSchema = z.object({
  llm: z.object({
    provider: z.enum(["none", "groq", "gemini", "mistral", "cerebras", "openrouter", "huggingface", "custom"]).optional(),
    baseUrl: z.string().optional(),
    model: z.string().optional(),
    enabled: z.boolean().optional(),
    apiKey: z.string().optional(), // write-only → .data/secrets.json
  }).optional(),
  ssh: z.object({
    user: z.string().min(1).max(64).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    hostKeyPolicy: z.enum(["strict", "accept-new"]).optional(),
    sudo: z.boolean().optional(),
    timeoutMs: z.number().int().min(1000).max(600_000).optional(),
    privateKey: z.string().max(65_536).optional(), // write-only → .data/secrets.json ("" clears)
    bastion: z.object({
      host: z.string().max(253).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      user: z.string().max(64).optional(),
      privateKey: z.string().max(65_536).optional(), // write-only
    }).nullable().optional(),
    hostMap: z.record(z.string(), z.string().max(260)).optional(),
    orchestratorUrl: z.string().url().nullable().optional(),
    forgetKnownHosts: z.boolean().optional(),
  }).optional(),
  operator: z.object({ name: z.string().optional(), phone: z.string().optional(), org: z.string().optional() }).optional(),
  sim: z.object({ speed: z.number().min(0.25).max(16).optional(), autoRun: z.boolean().optional(), quietHours: z.boolean().optional() }).optional(),
});

export async function PATCH(req: Request) {
  rt();
  const parsed = await parseBody(req, PatchSchema);
  if ("error" in parsed) return parsed.error;
  const s = store.s.settings;
  const { llm, ssh, operator, sim } = parsed.data;
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
  if (ssh) applySshSettingsPatch(ssh);
  if (operator) Object.assign(s.operator, operator);
  if (sim) Object.assign(s.sim, sim);
  store.markDirty();
  const view = redacted();
  bus.emit("system", { settings: view }, { summary: "settings updated", href: "/settings" });
  return json({ settings: view });
}
