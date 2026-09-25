/**
 * Optional outbound delivery (SPEC §8). Agent/system messages that pass the
 * operator's DeliveryFilter are pushed to one configured channel (generic
 * webhook, Slack incoming webhook, Twilio SMS) from a bounded in-memory
 * queue — fire-and-forget, never on the tick loop's critical path. Each
 * attempt's outcome is recorded on `Message.delivery`; `deliveredAt` is only
 * set once the channel confirms. Config lives in settings.delivery; secrets
 * (HMAC key, Twilio auth token) in .data/secrets.json and never leave the box.
 */
import type { DeliveryChannel, DeliveryFilter, DeliverySettings, Message, MessageDelivery, Severity } from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";
import { bus } from "../bus";
import { store } from "../store";
import { G } from "../shared";
import { toEnvelope, type DeliveryEnvelope } from "./envelope";
import { sendWebhook } from "./channels/webhook";
import { isSlackUrl, sendSlack } from "./channels/slack";
import { sendTwilio } from "./channels/twilio";

export type ActiveChannel = Exclude<DeliveryChannel, "off">;

/** Tunables — tests shorten the backoff. */
export const deliveryOptions = {
  maxAttempts: 3,
  backoffMs: [500, 2000],
  queueCap: 200,
};

export function defaultDeliverySettings(): DeliverySettings {
  return {
    channel: "off",
    url: "",
    twilio: { accountSid: "", from: "", to: "" },
    filter: { minSeverity: "info", kinds: [], agentIds: [] },
    secretSet: false,
    twilioAuthTokenSet: false,
  };
}

export interface DeliveryConfigPatch {
  channel?: DeliveryChannel;
  url?: string;
  twilio?: Partial<DeliverySettings["twilio"]>;
  filter?: Partial<DeliveryFilter>;
  /** write-only; "" clears */
  secret?: string;
  /** write-only; "" clears */
  twilioAuthToken?: string;
}

/** Settings as the client may see them — secrets replaced by *Set flags. */
export function redactedDelivery(): DeliverySettings {
  const d = store.s.settings.delivery;
  return { ...d, twilio: { ...d.twilio }, filter: { ...d.filter, kinds: [...d.filter.kinds], agentIds: [...d.filter.agentIds] }, secretSet: !!store.secrets.deliverySecret, twilioAuthTokenSet: !!store.secrets.twilioAuthToken };
}

export function configureDelivery(patch: DeliveryConfigPatch): DeliverySettings {
  const d = (store.s.settings.delivery ??= defaultDeliverySettings());
  if (patch.channel) d.channel = patch.channel;
  if (patch.url !== undefined) d.url = patch.url.trim();
  if (patch.twilio) Object.assign(d.twilio, patch.twilio);
  if (patch.filter) {
    if (patch.filter.minSeverity) d.filter.minSeverity = patch.filter.minSeverity;
    if (patch.filter.kinds) d.filter.kinds = [...patch.filter.kinds];
    if (patch.filter.agentIds) d.filter.agentIds = [...patch.filter.agentIds];
  }
  let secretsTouched = false;
  if (patch.secret !== undefined) {
    store.secrets.deliverySecret = patch.secret || undefined;
    secretsTouched = true;
  }
  if (patch.twilioAuthToken !== undefined) {
    store.secrets.twilioAuthToken = patch.twilioAuthToken || undefined;
    secretsTouched = true;
  }
  if (secretsTouched) store.saveSecrets();
  d.secretSet = !!store.secrets.deliverySecret;
  d.twilioAuthTokenSet = !!store.secrets.twilioAuthToken;
  store.markDirty();
  return redactedDelivery();
}

/** Effective adapter: explicit channel, with hooks.slack.com URLs auto-upgraded to Slack. */
export function resolveChannel(d: DeliverySettings = store.s.settings.delivery): ActiveChannel | null {
  if (d.channel === "off") return null;
  if (d.channel === "twilio") {
    return d.twilio.accountSid && d.twilio.from && d.twilio.to && store.secrets.twilioAuthToken ? "twilio" : null;
  }
  if (!d.url) return null;
  return d.channel === "slack" || isSlackUrl(d.url) ? "slack" : "webhook";
}

export function deliveryConfigured(): boolean {
  return resolveChannel() !== null;
}

export function passesFilter(msg: Pick<Message, "kind" | "severity" | "agentId" | "from">, f: DeliveryFilter): boolean {
  if (msg.from === "operator") return false;
  const sev: Severity = msg.severity ?? "info";
  if (SEVERITY_ORDER.indexOf(sev) < SEVERITY_ORDER.indexOf(f.minSeverity)) return false;
  if (f.kinds.length && !f.kinds.includes(msg.kind)) return false;
  if (f.agentIds.length && (!msg.agentId || !f.agentIds.includes(msg.agentId))) return false;
  return true;
}

async function sendVia(channel: ActiveChannel, env: DeliveryEnvelope): Promise<void> {
  const d = store.s.settings.delivery;
  if (channel === "webhook") return sendWebhook(env, { url: d.url, secret: store.secrets.deliverySecret });
  if (channel === "slack") return sendSlack(env, { url: d.url });
  return sendTwilio(env, { ...d.twilio, authToken: store.secrets.twilioAuthToken ?? "" });
}

export const CHANNEL_LABEL: Record<ActiveChannel, string> = { webhook: "webhook", slack: "Slack", twilio: "SMS" };

/* ── bounded queue ── */

interface Job {
  msg: Message;
  entry: MessageDelivery;
  channel: ActiveChannel;
  resolve: (d: MessageDelivery) => void;
}

const queue: Job[] = [];
let pumping = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function finish(job: Job, status: MessageDelivery["status"], error?: string): void {
  job.entry.status = status;
  job.entry.at = store.now();
  if (error) job.entry.error = error.slice(0, 200);
  else delete job.entry.error;
  if (status === "sent") job.msg.deliveredAt = store.now();
  store.markDirty();
  bus.emit("message.updated", { threadId: job.msg.threadId, messageId: job.msg.id, delivery: job.entry }, {
    agentId: job.msg.agentId,
    summary: `${job.msg.id} ${status === "sent" ? "delivered via" : "delivery failed on"} ${CHANNEL_LABEL[job.channel]}`,
    href: `/messages?thread=${job.msg.threadId}`,
  });
  job.resolve(job.entry);
}

async function runJob(job: Job): Promise<void> {
  const env = toEnvelope(job.msg);
  let lastError = "unknown";
  for (let attempt = 0; attempt < deliveryOptions.maxAttempts; attempt++) {
    if (attempt > 0) await sleep(deliveryOptions.backoffMs[Math.min(attempt - 1, deliveryOptions.backoffMs.length - 1)] ?? 0);
    try {
      await sendVia(job.channel, env);
      finish(job, "sent");
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  finish(job, "failed", lastError);
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      try {
        await runJob(job);
      } catch (err) {
        finish(job, "failed", err instanceof Error ? err.message : String(err));
      }
    }
  } finally {
    pumping = false;
  }
}

/**
 * Queue an outbound copy of `msg` if a channel is configured and the filter
 * admits it. Returns immediately; the promise settles with the recorded
 * outcome (null when nothing was queued).
 */
export function deliver(msg: Message): Promise<MessageDelivery | null> {
  const d = store.s.settings.delivery;
  const channel = resolveChannel(d);
  if (!channel || !passesFilter(msg, d.filter)) return Promise.resolve(null);

  const entry: MessageDelivery = { channel, status: "queued", at: store.now() };
  (msg.delivery ??= []).push(entry);
  msg.deliveredAt = undefined;
  store.markDirty();

  return new Promise<MessageDelivery | null>((resolve) => {
    const job: Job = { msg, entry, channel, resolve };
    if (queue.length >= deliveryOptions.queueCap) {
      finish(job, "failed", "delivery queue full");
      return;
    }
    queue.push(job);
    setImmediate(() => void pump());
  });
}

/** Subscribe once per process: every agent/system message goes through deliver(). */
export function hookDeliveryToBus(): void {
  if (G.__qalaaDeliveryHooked) return;
  G.__qalaaDeliveryHooked = true;
  bus.subscribe((ev) => {
    if (ev.type !== "message.sent") return;
    const msg = (ev.payload as { message?: Message } | undefined)?.message;
    if (!msg || msg.from === "operator") return;
    void deliver(msg);
  });
}

/** POST /api/settings/delivery/test — one direct send, no retry; result stored as lastTest. */
export async function deliveryTest(): Promise<NonNullable<DeliverySettings["lastTest"]>> {
  const d = store.s.settings.delivery;
  const at = store.now();
  const channel = resolveChannel(d);
  if (!channel) {
    const r = { ok: false, at, channel: d.channel, error: "not configured" };
    d.lastTest = r;
    store.markDirty();
    return r;
  }
  const operator = store.s.settings.operator.name || "Operator";
  const env: DeliveryEnvelope = {
    id: "MSG-test",
    threadId: "thr-cassidy",
    from: "agent",
    agentName: "Cassidy",
    kind: "status",
    severity: "info",
    text: `Howdy ${operator} — Qalaa delivery test. The gang can reach you here; reply "status" to check the line.`,
    quickReplies: [],
    href: "/messages?thread=thr-cassidy",
    sentAt: at,
  };
  const started = Date.now();
  try {
    await sendVia(channel, env);
    const r = { ok: true, at, channel, latencyMs: Date.now() - started };
    d.lastTest = r;
    store.markDirty();
    return r;
  } catch (err) {
    const r = { ok: false, at, channel, latencyMs: Date.now() - started, error: String(err instanceof Error ? err.message : err) };
    d.lastTest = r;
    store.markDirty();
    return r;
  }
}
