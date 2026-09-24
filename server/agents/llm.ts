/**
 * OpenAI-compatible chat client (SPEC §7). 8 s timeout, 1 retry, global
 * limiter 1 call / 3 s (excess → fallback). Key lives in .data/secrets.json
 * (store.secrets.llmApiKey) — never returned to the client.
 */
import type { LLMProvider, LLMUsage } from "@/lib/types";
import { store } from "../store";

export const LLM_PRESETS: Record<Exclude<LLMProvider, "none" | "custom">, { baseUrl: string; model: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-20b" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  mistral: { baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", model: "llama3.1-8b" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
  huggingface: { baseUrl: "https://router.huggingface.co/v1", model: "meta-llama/Meta-Llama-3.1-8B-Instruct" },
};

export function llmConfigured(): boolean {
  const s = store.s.settings.llm;
  return s.enabled && s.provider !== "none" && !!store.secrets.llmApiKey && !!s.baseUrl && !!s.model;
}

let lastCallAt = 0;

async function chatOnce(system: string, user: string): Promise<{ text: string; latencyMs: number }> {
  const s = store.s.settings.llm;
  const key = store.secrets.llmApiKey!;
  const url = `${s.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: s.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 220,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`llm ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("llm empty response");
  return { text, latencyMs: Date.now() - started };
}

export interface LlmResult {
  text?: string;
  usage: LLMUsage;
}

/** Call the LLM with limiter + retry; on any failure returns fallback usage. */
export async function llmChat(system: string, user: string): Promise<LlmResult> {
  const s = store.s.settings.llm;
  const usage: LLMUsage = { provider: s.provider, model: s.model, tokensIn: 0, tokensOut: 0, latencyMs: 0, fallback: false };
  if (!llmConfigured()) {
    usage.fallback = true;
    return { usage };
  }
  const gap = Date.now() - lastCallAt;
  if (gap < 3000) {
    usage.fallback = true; // limiter: 1 call / 3 s
    return { usage };
  }
  lastCallAt = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, latencyMs } = await chatOnce(system, user);
      usage.latencyMs = latencyMs;
      usage.tokensIn = Math.ceil((system.length + user.length) / 4);
      usage.tokensOut = Math.ceil(text.length / 4);
      return { text, usage };
    } catch {
      if (attempt === 0) lastCallAt = 0; // allow immediate retry
    }
  }
  usage.fallback = true;
  return { usage };
}

/** POST /api/settings/llm/test → "Reply with one word: ready" */
export async function llmTest(): Promise<{ ok: boolean; at: string; latencyMs?: number; error?: string; sample?: string }> {
  const at = store.now();
  if (!llmConfigured()) {
    const r = { ok: false, at, error: "not configured or disabled" };
    store.s.settings.llm.lastTest = r;
    store.markDirty();
    return r;
  }
  const started = Date.now();
  try {
    const { text } = await chatOnce("You are a terse readiness probe.", "Reply with one word: ready");
    const r = { ok: true, at, latencyMs: Date.now() - started, sample: text.slice(0, 80) };
    store.s.settings.llm.lastTest = r;
    store.markDirty();
    return r;
  } catch (err) {
    const r = { ok: false, at, latencyMs: Date.now() - started, error: String(err instanceof Error ? err.message : err) };
    store.s.settings.llm.lastTest = r;
    store.markDirty();
    return r;
  }
}
