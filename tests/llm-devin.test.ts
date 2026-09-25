import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { getRuntime } from "@/server/runtime";
import { store } from "@/server/store";
import { llmChat, llmChatDeferred, llmConfigured, llmIsSlow, llmTest, devinOptions, llmOptions, LLM_PRESETS } from "@/server/agents/llm";
import { narrate } from "@/server/agents/narrator";
import { handleOperatorMessage } from "@/server/messaging/commands";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const url = (call: Parameters<typeof fetch>) => String(call[0]);
const body = (call: Parameters<typeof fetch>) => JSON.parse(String(call[1]?.body ?? "{}")) as Record<string, unknown>;

let fetchMock: FetchMock;

/** A fake api.devin.ai: one session, replies to each message on the next poll. */
function fakeDevin(reply: (prompt: string) => string) {
  let n = 0;
  const messages: { event_id: string; message: string; timestamp: string; type: string }[] = [];
  let pending: string | undefined;
  const push = (type: string, message: string) => messages.push({ event_id: `evt-${++n}`, message, timestamp: new Date().toISOString(), type });
  fetchMock.mockImplementation(async (input, init) => {
    const u = String(input);
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== "Bearer cog_test") return json({ detail: "unauthorized" }, 401);
    if (u.endsWith("/sessions") && init?.method === "POST") {
      const b = JSON.parse(String(init.body)) as { prompt: string };
      push("user_message", b.prompt);
      pending = b.prompt;
      return json({ session_id: "devin-brain", url: "https://app.devin.ai/sessions/brain", is_new_session: true });
    }
    if (u.endsWith("/sessions/devin-brain/message") && init?.method === "POST") {
      const b = JSON.parse(String(init.body)) as { message: string };
      push("user_message", b.message);
      pending = b.message;
      return json(null);
    }
    if (u.endsWith("/sessions/devin-brain")) {
      if (pending !== undefined) {
        push("devin_message", reply(pending));
        pending = undefined;
        return json({ session_id: "devin-brain", status_enum: "working", messages: [...messages] });
      }
      return json({ session_id: "devin-brain", status_enum: "blocked", messages: [...messages] });
    }
    return json({ detail: "not found" }, 404);
  });
  return { messages };
}

beforeAll(() => getRuntime());

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  devinOptions.pollMs = 1;
  devinOptions.waitMs = 2000;
  llmOptions.limiterMs = 0;
  Object.assign(store.s.settings.llm, { provider: "devin", enabled: true, ...LLM_PRESETS.devin, sessionUrl: undefined });
  store.secrets.llmApiKey = "cog_test";
  store.secrets.devinSessionId = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
  llmOptions.limiterMs = 3000;
  Object.assign(store.s.settings.llm, { provider: "none", enabled: false, baseUrl: "", model: "", sessionUrl: undefined });
  store.secrets.llmApiKey = undefined;
  store.secrets.devinSessionId = undefined;
});

describe("devin provider", () => {
  it("is configured + flagged slow with the preset and a key", () => {
    expect(llmConfigured()).toBe(true);
    expect(llmIsSlow()).toBe(true);
    expect(LLM_PRESETS.devin.baseUrl).toBe("https://api.devin.ai/v1");
  });

  it("opens one brain session, waits for the brief ack, then messages it per prompt", async () => {
    const fake = fakeDevin((p) => (p.includes("Acknowledge this brief") ? "ready" : `echo: ${p.split("\n\n").at(-1)}`));
    const r = await llmChat("Be terse.", "Say hi to prod-01");
    expect(r.text).toBe("echo: Say hi to prod-01");
    expect(r.usage.fallback).toBe(false);
    expect(r.usage.provider).toBe("devin");

    const creates = fetchMock.mock.calls.filter((c) => url(c).endsWith("/sessions") && c[1]?.method === "POST");
    expect(creates).toHaveLength(1);
    const created = body(creates[0]);
    expect(created.unlisted).toBe(true);
    expect(created.max_acu_limit).toBe(devinOptions.maxAcu);
    expect(String(created.prompt)).toContain("Qalaa");

    const sends = fetchMock.mock.calls.filter((c) => url(c).endsWith("/message"));
    expect(sends).toHaveLength(1);
    expect(String(body(sends[0]).message)).toContain("[instruction] Be terse.");

    expect(store.secrets.devinSessionId).toBe("devin-brain");
    expect(store.s.settings.llm.sessionUrl).toBe("https://app.devin.ai/sessions/brain");
    expect(fake.messages.filter((m) => m.type === "user_message")).toHaveLength(2);
  });

  it("reuses the persisted session and ignores replies it has already seen", async () => {
    fakeDevin((p) => (p.includes("Acknowledge") ? "ready" : `A:${p.slice(-3)}`));
    await llmChat("s", "one");
    const before = fetchMock.mock.calls.length;
    const r = await llmChat("s", "two");
    expect(r.text).toBe("A:two");
    const creates = fetchMock.mock.calls.slice(before).filter((c) => url(c).endsWith("/sessions") && c[1]?.method === "POST");
    expect(creates).toHaveLength(0);
  });

  it("opens a fresh session when the stored one is finished", async () => {
    fakeDevin(() => "ready");
    store.secrets.devinSessionId = "devin-old";
    fetchMock.mockImplementationOnce(async () => json({ session_id: "devin-old", status_enum: "finished", messages: [] }));
    const r = await llmChat("s", "u");
    expect(r.text).toBe("ready");
    expect(store.secrets.devinSessionId).toBe("devin-brain");
  });

  it("falls back on auth failure without throwing", async () => {
    fakeDevin(() => "ready");
    store.secrets.llmApiKey = "cog_wrong";
    const r = await llmChat("s", "u");
    expect(r.text).toBeUndefined();
    expect(r.usage.fallback).toBe(true);
  });

  it("Save & test round-trips through the brain session", async () => {
    fakeDevin((p) => (p.includes("Acknowledge") ? "ready" : "ready"));
    const r = await llmTest();
    expect(r.ok).toBe(true);
    expect(r.sample).toBe("ready");
    expect(store.s.settings.llm.lastTest?.ok).toBe(true);
  });

  it("narrate() returns the template now and patches via onLate", async () => {
    fakeDevin((p) => (p.includes("Acknowledge") ? "ready" : "Devin says hello"));
    const agent = store.agent("agt-cassidy")!;
    const late = new Promise<string>((resolve) => {
      void narrate(agent, () => "template copy", { user: "write a line" }, (t) => resolve(t)).then((r) => {
        expect(r.text).toBe("template copy");
        expect(r.llm).toBeUndefined();
      });
    });
    expect(await late).toBe("Devin says hello");
  });

  it("freeform operator questions get an immediate holding reply and a Devin follow-up", async () => {
    fakeDevin((p) => (p.includes("Acknowledge") ? "ready" : "Fleet is quiet, 0 open threats."));
    const before = store.s.messages.length;
    const { replies } = await handleOperatorMessage("thr-cassidy", "how are things looking today?");
    expect(replies[0].text).toMatch(/think on that/i);
    await vi.waitFor(() => {
      const followUp = store.s.messages.slice(before).find((m) => m.from === "agent" && m.text.includes("Fleet is quiet"));
      expect(followUp).toBeDefined();
    });
  });

  it("llmChatDeferred never rejects when Devin times out", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const u = String(input);
      if (u.endsWith("/sessions") && init?.method === "POST") return json({ session_id: "devin-brain", url: "u" });
      return json({ session_id: "devin-brain", status_enum: "working", messages: [] });
    });
    devinOptions.waitMs = 5;
    const onText = vi.fn();
    llmChatDeferred("s", "u", onText);
    await new Promise((r) => setTimeout(r, 50));
    expect(onText).not.toHaveBeenCalled();
  });
});
