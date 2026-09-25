/**
 * LLM client (SPEC §7). Two transports behind one `chatOnce`:
 *  - OpenAI-compatible `POST {baseUrl}/chat/completions` — 8 s timeout, 1 retry.
 *  - `devin` — one long-lived Devin session (api.devin.ai/v1) that the agents
 *    message and poll; replies take tens of seconds, so callers on the tick
 *    path use `llmChatDeferred` and patch their copy when the answer lands.
 * Global limiter 1 call / 3 s (excess → fallback). Key lives in
 * .data/secrets.json (store.secrets.llmApiKey) — never returned to the client.
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
  devin: { baseUrl: "https://api.devin.ai/v1", model: "devin" },
};

export function llmConfigured(): boolean {
  const s = store.s.settings.llm;
  return s.enabled && s.provider !== "none" && !!store.secrets.llmApiKey && !!s.baseUrl && !!s.model;
}

/** Devin answers in tens of seconds, not milliseconds — tick-path callers must not await it. */
export function llmIsSlow(): boolean {
  return store.s.settings.llm.provider === "devin";
}

let lastCallAt = 0;
/** global limiter: at most one LLM call per window (excess → fallback) */
export const llmOptions = { limiterMs: 3000 };

/* ─────────────────────────── Devin session transport ─────────────────────────── */

export const devinOptions = {
  /** poll interval while waiting for the brain session to answer */
  pollMs: 3000,
  /** give up waiting for one answer after this long */
  waitMs: 240_000,
  /** ACU cap on the brain session; a fresh one is opened when it runs out */
  maxAcu: 5,
  /** more than this many prompts waiting on the single session → fallback */
  maxQueue: 3,
};

const BRAIN_BRIEF = `You are the language brain for Qalaa, an agent-run threat-intel platform. Six security agents (Cassidy, Sundance, Doc, Belle, Ringo, Calamity) will send you short prompts as chat messages, each prefixed with an instruction block. For every message: reply with ONLY the requested text — first person, short, concrete, name hosts and ids, no exclamation marks, no markdown, no preamble, at most 60 words. Never run commands, never write code, never open files or PRs, never ask questions back, never wait for anything. Answer each message immediately, then wait for the next one. Acknowledge this brief with the single word: ready`;

interface DevinSession {
  session_id: string;
  url: string;
  status_enum?: string | null;
  messages?: { event_id: string; message: string; timestamp: string; type: string }[];
}

function devinHeaders(): HeadersInit {
  return { "content-type": "application/json", authorization: `Bearer ${store.secrets.llmApiKey!}` };
}

function devinUrl(path: string): string {
  return `${store.s.settings.llm.baseUrl.replace(/\/$/, "")}${path}`;
}

async function devinFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(devinUrl(path), { ...init, headers: devinHeaders(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`devin ${res.status}`);
  return (await res.json().catch(() => null)) as T;
}

function rememberSession(id: string | undefined, url: string | undefined): void {
  store.secrets.devinSessionId = id;
  store.saveSecrets();
  store.s.settings.llm.sessionUrl = url;
  store.markDirty();
}

const DEAD = new Set(["finished", "expired"]);

/** Polls until Devin posts a message not in `seen` (or the session dies). */
async function devinWaitReply(id: string, seen: Set<string>): Promise<DevinSession> {
  const deadline = Date.now() + devinOptions.waitMs;
  for (;;) {
    const s = await devinFetch<DevinSession>(`/sessions/${id}`);
    if (lastReply(s, seen) !== undefined || (s.status_enum && DEAD.has(s.status_enum))) return s;
    if (Date.now() > deadline) throw new Error("devin timeout");
    await new Promise((r) => setTimeout(r, devinOptions.pollMs));
  }
}

const seenIds = (s: DevinSession | null | undefined): Set<string> => new Set((s?.messages ?? []).map((m) => m.event_id));

function lastReply(s: DevinSession, seen: Set<string>): string | undefined {
  const replies = (s.messages ?? []).filter((m) => m.type !== "user_message" && !seen.has(m.event_id) && m.message.trim());
  return replies.at(-1)?.message.trim();
}

/** Opens (or reuses) the persistent brain session; returns its id + the messages already on it. */
async function devinSession(): Promise<{ id: string; seen: Set<string> }> {
  const existing = store.secrets.devinSessionId;
  if (existing) {
    try {
      const s = await devinFetch<DevinSession>(`/sessions/${existing}`);
      if (!s.status_enum || !DEAD.has(s.status_enum)) return { id: existing, seen: seenIds(s) };
    } catch {
      /* fall through → new session */
    }
  }
  const created = await devinFetch<DevinSession>("/sessions", {
    method: "POST",
    body: JSON.stringify({ prompt: BRAIN_BRIEF, title: "Qalaa agent brain", unlisted: true, tags: ["qalaa", "brain"], max_acu_limit: devinOptions.maxAcu }),
  });
  rememberSession(created.session_id, created.url);
  const s = await devinWaitReply(created.session_id, new Set());
  return { id: created.session_id, seen: seenIds(s) };
}

let devinChain: Promise<unknown> = Promise.resolve();
let devinQueued = 0;

async function devinChatOnce(system: string, user: string): Promise<{ text: string; latencyMs: number }> {
  if (devinQueued >= devinOptions.maxQueue) throw new Error("devin busy");
  devinQueued++;
  const run = async () => {
    const started = Date.now();
    const { id, seen } = await devinSession();
    await devinFetch<unknown>(`/sessions/${id}/message`, { method: "POST", body: JSON.stringify({ message: `[instruction] ${system}\n\n${user}` }) });
    const s = await devinWaitReply(id, seen);
    if (s.status_enum && DEAD.has(s.status_enum)) rememberSession(undefined, undefined);
    const text = lastReply(s, seen);
    if (!text) throw new Error("devin empty response");
    return { text, latencyMs: Date.now() - started };
  };
  const p = devinChain.then(run, run);
  devinChain = p.catch(() => undefined);
  try {
    return await p;
  } finally {
    devinQueued--;
  }
}

/* ─────────────────────────── OpenAI-compatible transport ─────────────────────────── */

async function chatOnce(system: string, user: string): Promise<{ text: string; latencyMs: number }> {
  const s = store.s.settings.llm;
  if (s.provider === "devin") return devinChatOnce(system, user);
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
  if (gap < llmOptions.limiterMs) {
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

/**
 * Fire-and-forget variant for the tick path: returns nothing now and calls
 * `onText` when the answer lands. Used when the provider is slow (`devin`);
 * callers keep their template copy in the meantime.
 */
export function llmChatDeferred(system: string, user: string, onText: (text: string, usage: LLMUsage) => void): void {
  void llmChat(system, user).then(({ text, usage }) => {
    if (text) onText(text, usage);
  });
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
