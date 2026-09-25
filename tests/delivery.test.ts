import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { getRuntime } from "@/server/runtime";
import { store } from "@/server/store";
import { sendMessage, operatorSay, notifyApprovalRequest } from "@/server/messaging/composer";
import { createApproval } from "@/server/governance/approvals";
import { toEnvelope } from "@/server/messaging/envelope";
import { signBody, verifySignature, SIGNATURE_HEADER, sendWebhook } from "@/server/messaging/channels/webhook";
import { renderSlack, isSlackUrl, SLACK_SEVERITY } from "@/server/messaging/channels/slack";
import { renderSms, sendTwilio, twilioMessagesUrl, twilioSignature, verifyTwilioSignature, renderTwiml, SMS_MAX_CHARS } from "@/server/messaging/channels/twilio";
import { configureDelivery, deliver, deliveryOptions, deliveryTest, passesFilter, redactedDelivery, resolveChannel } from "@/server/messaging/delivery";
import { inboundGeneric, inboundTwilio } from "@/server/messaging/inbound";
import { POST as inboundRoute } from "@/app/api/messages/inbound/route";
import { decide } from "@/lib/auth/gate";
import type { Message } from "@/lib/types";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

const ok = (body: unknown = { ok: true }, status = 200) => new Response(JSON.stringify(body), { status });
const fail = (status: number) => new Response("nope", { status });

let fetchMock: FetchMock;

beforeAll(() => getRuntime());

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  deliveryOptions.backoffMs = [1, 1];
  store.secrets.deliverySecret = undefined;
  store.secrets.twilioAuthToken = undefined;
  configureDelivery({ channel: "off", url: "", twilio: { accountSid: "", from: "", to: "" }, filter: { minSeverity: "info", kinds: [], agentIds: [] } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lastCall = () => {
  const call = fetchMock.mock.calls.at(-1)!;
  return { url: String(call[0]), init: call[1] as RequestInit & { headers: Record<string, string> } };
};

function alertFromCassidy(text = "Cassidy: credential stuffing on stg-worker-01", severity: Message["severity"] = "high"): Message {
  return sendMessage("thr-cassidy", "agent", text, { agentId: "agt-cassidy", kind: "alert", severity });
}

/* ── envelope + webhook ── */

describe("generic webhook", () => {
  it("POSTs the JSON envelope with a valid HMAC signature", async () => {
    fetchMock.mockResolvedValue(ok());
    const msg = alertFromCassidy();
    await sendWebhook(toEnvelope(msg), { url: "https://example.test/hook", secret: "s3cret" });

    const { url, init } = lastCall();
    expect(url).toBe("https://example.test/hook");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");

    const raw = String(init.body);
    const env = JSON.parse(raw);
    expect(Object.keys(env).sort()).toEqual(["agentName", "from", "href", "id", "kind", "quickReplies", "sentAt", "severity", "text", "threadId"]);
    expect(env).toMatchObject({ id: msg.id, threadId: "thr-cassidy", from: "agent", agentName: "Cassidy", kind: "alert", severity: "high", text: msg.text, href: "/messages?thread=thr-cassidy" });

    const sig = init.headers[SIGNATURE_HEADER];
    expect(sig).toBe(`sha256=${createHmac("sha256", "s3cret").update(raw).digest("hex")}`);
    expect(verifySignature(raw, "s3cret", sig)).toBe(true);
    expect(verifySignature(raw, "wrong", sig)).toBe(false);
    expect(verifySignature(raw + " ", "s3cret", sig)).toBe(false);
    expect(signBody("x", "k")).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("omits the signature header when no secret is set", async () => {
    fetchMock.mockResolvedValue(ok());
    await sendWebhook(toEnvelope(alertFromCassidy()), { url: "https://example.test/hook" });
    expect(lastCall().init.headers[SIGNATURE_HEADER]).toBeUndefined();
  });

  it("uses a bounded timeout signal", async () => {
    fetchMock.mockResolvedValue(ok());
    await sendWebhook(toEnvelope(alertFromCassidy()), { url: "https://example.test/hook" });
    expect(lastCall().init.signal).toBeInstanceOf(AbortSignal);
  });
});

/* ── slack ── */

describe("slack", () => {
  it("detects hooks.slack.com URLs", () => {
    expect(isSlackUrl("https://hooks.slack.com/services/T000/B000/XXX")).toBe(true);
    expect(isSlackUrl("https://example.com/hook")).toBe(false);
    expect(isSlackUrl("not a url")).toBe(false);
  });

  it("renders Block Kit with severity colour/emoji and quick-reply hints", () => {
    const approval = createApproval({ traceId: "TR-test", agent: store.agent("agt-sundance")!, toolName: "isolate_host", summary: "Isolate the box.", risk: "high", targets: ["stg-worker-01"] });
    const msg = notifyApprovalRequest(store.agent("agt-sundance")!, approval);
    const payload = renderSlack(toEnvelope(msg));

    expect(payload.text).toContain("[Qalaa · Cassidy · medium]");
    expect(payload.attachments[0].color).toBe(SLACK_SEVERITY.medium.color);
    const blocks = payload.attachments[0].blocks;
    expect(blocks[0]).toMatchObject({ type: "section" });
    expect(JSON.stringify(blocks[0])).toContain(SLACK_SEVERITY.medium.emoji);
    expect(JSON.stringify(blocks[0])).toContain("approval-request");
    const hints = blocks.find((b) => b.type === "context" && JSON.stringify(b).includes("Reply:"));
    expect(JSON.stringify(hints)).toContain(`approve ${approval.id}`);
    expect(JSON.stringify(hints)).toContain(`reject ${approval.id}`);
  });

  it("is auto-selected for a Slack URL even when channel=webhook, and honoured when explicit", () => {
    configureDelivery({ channel: "webhook", url: "https://hooks.slack.com/services/T/B/X" });
    expect(resolveChannel()).toBe("slack");
    configureDelivery({ channel: "slack", url: "https://relay.example.test/slack" });
    expect(resolveChannel()).toBe("slack");
    configureDelivery({ channel: "webhook", url: "https://relay.example.test/hook" });
    expect(resolveChannel()).toBe("webhook");
  });
});

/* ── twilio ── */

describe("twilio sms", () => {
  it("POSTs form-encoded From/To/Body with basic auth to the Messages endpoint", async () => {
    fetchMock.mockResolvedValue(ok({ sid: "SM1" }, 201));
    const msg = alertFromCassidy("Lock it down.", "critical");
    await sendTwilio(toEnvelope(msg), { accountSid: "AC123", authToken: "tok", from: "+15550000001", to: "+15550000002" });

    const { url, init } = lastCall();
    expect(url).toBe(twilioMessagesUrl("AC123"));
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from("AC123:tok").toString("base64")}`);
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("From")).toBe("+15550000001");
    expect(form.get("To")).toBe("+15550000002");
    expect(form.get("Body")).toBe("[Qalaa · Cassidy · critical] Lock it down.");
  });

  it("appends quick replies as a Reply: hint and truncates to 1500 chars", () => {
    const approval = createApproval({ traceId: "TR-test", agent: store.agent("agt-doc")!, toolName: "quarantine_dataset", summary: "Kill it.", risk: "medium", targets: ["dataset-worker-01"] });
    const msg = notifyApprovalRequest(store.agent("agt-doc")!, approval);
    const body = renderSms(toEnvelope(msg));
    expect(body).toContain(`Reply: Approve ${approval.id} / Reject ${approval.id}`);

    const long = renderSms(toEnvelope(alertFromCassidy("x".repeat(2000))));
    expect(long.length).toBe(SMS_MAX_CHARS);
    expect(long.endsWith("…")).toBe(true);
  });

  it("throws on non-2xx so the queue can retry", async () => {
    fetchMock.mockResolvedValue(fail(401));
    await expect(sendTwilio(toEnvelope(alertFromCassidy()), { accountSid: "AC1", authToken: "bad", from: "+1", to: "+2" })).rejects.toThrow(/401/);
  });
});

/* ── filter ── */

describe("delivery filter", () => {
  const base = { from: "agent" as const, agentId: "agt-cassidy", kind: "alert" as const, severity: "high" as const };
  it("never passes operator messages", () => {
    expect(passesFilter({ ...base, from: "operator" }, { minSeverity: "info", kinds: [], agentIds: [] })).toBe(false);
  });
  it("applies minSeverity (missing severity counts as info)", () => {
    expect(passesFilter(base, { minSeverity: "high", kinds: [], agentIds: [] })).toBe(true);
    expect(passesFilter(base, { minSeverity: "critical", kinds: [], agentIds: [] })).toBe(false);
    expect(passesFilter({ ...base, severity: undefined }, { minSeverity: "low", kinds: [], agentIds: [] })).toBe(false);
    expect(passesFilter({ ...base, severity: undefined }, { minSeverity: "info", kinds: [], agentIds: [] })).toBe(true);
  });
  it("restricts by kinds and agentIds when non-empty", () => {
    expect(passesFilter(base, { minSeverity: "info", kinds: ["approval-request"], agentIds: [] })).toBe(false);
    expect(passesFilter(base, { minSeverity: "info", kinds: ["approval-request", "alert"], agentIds: [] })).toBe(true);
    expect(passesFilter(base, { minSeverity: "info", kinds: [], agentIds: ["agt-doc"] })).toBe(false);
    expect(passesFilter(base, { minSeverity: "info", kinds: [], agentIds: ["agt-cassidy"] })).toBe(true);
    expect(passesFilter({ ...base, agentId: undefined, from: "system" }, { minSeverity: "info", kinds: [], agentIds: ["agt-cassidy"] })).toBe(false);
  });
});

/* ── queue: deliver(), retry, outcomes ── */

describe("deliver()", () => {
  it("does nothing when the channel is off (engine unaffected)", async () => {
    const msg = alertFromCassidy();
    expect(await deliver(msg)).toBeNull();
    expect(msg.delivery).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Messages below are created while the channel is off (so the bus hook is a
  // no-op) and then handed to deliver() directly to observe the queue.
  it("records sent + deliveredAt after the channel confirms", async () => {
    fetchMock.mockResolvedValue(ok());
    const msg = alertFromCassidy();
    configureDelivery({ channel: "webhook", url: "https://example.test/hook", secret: "k" });
    const pending = deliver(msg);
    expect(msg.delivery?.[0]?.status).toBe("queued");
    expect(msg.deliveredAt).toBeUndefined(); // in-app timestamp cleared until the channel confirms
    const out = await pending;
    expect(out).toMatchObject({ channel: "webhook", status: "sent" });
    expect(msg.delivery).toHaveLength(1);
    expect(msg.deliveredAt).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is also triggered by the bus for agent messages, never for operator messages", async () => {
    fetchMock.mockResolvedValue(ok());
    configureDelivery({ channel: "webhook", url: "https://example.test/hook" });
    const before = fetchMock.mock.calls.length;
    const agentMsg = operatorSay("Howdy — Cassidy here.");
    const opMsg = sendMessage("thr-cassidy", "operator", "status");
    await new Promise((r) => setTimeout(r, 20));
    expect(agentMsg.delivery?.[0]?.status).toBe("sent");
    expect(opMsg.delivery).toBeUndefined();
    expect(fetchMock.mock.calls.length - before).toBe(1);
  });

  it("retries 3× with backoff then records failed (deliveredAt stays unset)", async () => {
    fetchMock.mockResolvedValueOnce(fail(500)).mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce(fail(503));
    const msg = alertFromCassidy();
    configureDelivery({ channel: "webhook", url: "https://example.test/hook" });
    const out = await deliver(msg);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out).toMatchObject({ channel: "webhook", status: "failed" });
    expect(out?.error).toMatch(/503/);
    expect(msg.deliveredAt).toBeUndefined();
  });

  it("succeeds on a later attempt", async () => {
    fetchMock.mockResolvedValueOnce(fail(502)).mockResolvedValueOnce(ok());
    const msg = alertFromCassidy();
    configureDelivery({ channel: "webhook", url: "https://example.test/hook" });
    const out = await deliver(msg);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out?.status).toBe("sent");
  });

  it("fails fast when the queue is full", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { release = () => r(ok()); })).mockResolvedValue(ok());
    const [one, two, three] = [alertFromCassidy("one"), alertFromCassidy("two"), alertFromCassidy("three")];
    configureDelivery({ channel: "webhook", url: "https://example.test/hook" });
    const cap = deliveryOptions.queueCap;
    deliveryOptions.queueCap = 1;
    try {
      const first = deliver(one);
      await new Promise((r) => setImmediate(r)); // first job dequeued, in flight
      const second = deliver(two); // queued (cap 1)
      const third = await deliver(three);
      expect(third).toMatchObject({ status: "failed", error: "delivery queue full" });
      release();
      expect((await first)?.status).toBe("sent");
      expect((await second)?.status).toBe("sent");
    } finally {
      deliveryOptions.queueCap = cap;
    }
  });

  it("deliveryTest() reports ok/latency and stores lastTest; never leaks secrets via redactedDelivery", async () => {
    fetchMock.mockResolvedValue(ok());
    configureDelivery({ channel: "webhook", url: "https://example.test/hook", secret: "hush" });
    const r = await deliveryTest();
    expect(r.ok).toBe(true);
    expect(r.channel).toBe("webhook");
    expect(store.s.settings.delivery.lastTest?.ok).toBe(true);
    const red = JSON.stringify(redactedDelivery());
    expect(red).not.toContain("hush");
    expect(redactedDelivery().secretSet).toBe(true);

    configureDelivery({ channel: "off" });
    expect((await deliveryTest()).ok).toBe(false);
  });
});

/* ── inbound ── */

describe("inbound", () => {
  const url = "https://qalaa.example.test/api/messages/inbound";

  it("accepts a Twilio webhook with a valid signature and routes Body through the command parser", async () => {
    store.secrets.twilioAuthToken = "twtoken";
    const approval = createApproval({ traceId: "TR-inb", agent: store.agent("agt-ringo")!, toolName: "isolate_host", summary: "Isolate.", risk: "high", targets: ["stg-worker-01"] });
    const params = { Body: `Approve ${approval.id}`, From: "+15550000002", MessageSid: "SM123" };
    const sig = twilioSignature("twtoken", url, params);
    expect(verifyTwilioSignature("twtoken", url, params, sig)).toBe(true);
    expect(verifyTwilioSignature("twtoken", url, params, "bogus")).toBe(false);
    expect(verifyTwilioSignature("twtoken", url, { ...params, Body: "Reject" }, sig)).toBe(false);

    const r = await inboundTwilio(url, params, sig);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sent.from).toBe("operator");
    expect(r.sent.text).toBe(`Approve ${approval.id}`);
    expect(store.approval(approval.id)?.status).toBe("approved");
    expect(r.replies.length).toBeGreaterThan(0);
    expect(renderTwiml(r.replies.map((m) => m.text))).toMatch(/^<\?xml.*<Response><Message>/s);
  });

  it("rejects a bad Twilio signature with 401 and does not touch state", async () => {
    store.secrets.twilioAuthToken = "twtoken";
    const approval = createApproval({ traceId: "TR-inb2", agent: store.agent("agt-ringo")!, toolName: "isolate_host", summary: "Isolate.", risk: "high", targets: ["stg-worker-02"] });
    const r = await inboundTwilio(url, { Body: `Approve ${approval.id}`, From: "+1" }, "sha1-of-nothing");
    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(store.approval(approval.id)?.status).toBe("pending");
  });

  it("route: form-encoded Twilio POST → TwiML; JSON with secret → replies; bad secret → 401", async () => {
    store.secrets.twilioAuthToken = "twtoken";
    store.secrets.deliverySecret = "shared";
    const params = { Body: "status", From: "+15550000002" };
    const form = new URLSearchParams(params).toString();
    const sig = twilioSignature("twtoken", url, params);

    const twiml = await inboundRoute(new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, body: form }));
    expect(twiml.status).toBe(200);
    expect(twiml.headers.get("content-type")).toContain("text/xml");
    expect(await twiml.text()).toMatch(/<Response><Message>.*(servers|threats)/is);

    const bad = await inboundRoute(new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "nope" }, body: form }));
    expect(bad.status).toBe(401);

    const okJson = await inboundRoute(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "help", secret: "shared" }) }));
    expect(okJson.status).toBe(200);
    const body = (await okJson.json()) as { sent: Message; replies: Message[] };
    expect(body.sent.from).toBe("operator");
    expect(body.replies[0].text).toContain("isolate");

    const badJson = await inboundRoute(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "help", secret: "wrong" }) }));
    expect(badJson.status).toBe(401);
  });

  it("generic inbound resolves an approval via parseCommand/handleOperatorMessage", async () => {
    store.secrets.deliverySecret = "shared";
    const approval = createApproval({ traceId: "TR-inb3", agent: store.agent("agt-belle")!, toolName: "block_egress", summary: "Block it.", risk: "low", targets: ["203.0.113.9"] });
    const r = await inboundGeneric({ text: `approve ${approval.id}`, secret: "shared" });
    expect(r.ok).toBe(true);
    expect(store.approval(approval.id)?.status).toBe("approved");
    expect((await inboundGeneric({ text: "status", secret: "x" })).ok).toBe(false);
    store.secrets.deliverySecret = undefined;
    expect(await inboundGeneric({ text: "status", secret: "shared" })).toMatchObject({ ok: false, status: 503 });
  });

  it("no real network calls were made", () => {
    for (const [target] of fetchMock.mock.calls) {
      expect(String(target)).toMatch(/example\.test|api\.twilio\.com|hooks\.slack\.com/);
    }
  });

  it("inbound route stays reachable for channel callbacks when operator auth is on", () => {
    expect(decide({ pathname: "/api/messages/inbound", enabled: true, authenticated: false })).toEqual({ kind: "allow" });
    expect(decide({ pathname: "/api/messages/threads", enabled: true, authenticated: false })).toEqual({ kind: "unauthorized" });
  });
});
