/**
 * Inbound operator replies from an outbound channel (SPEC §8). Twilio's
 * form-encoded webhook (Body/From, X-Twilio-Signature) and a generic JSON
 * `{ text, secret }` both land in handleOperatorMessage exactly as if typed
 * in /messages, so quick-reply commands like "Approve A-12" resolve.
 */
import { timingSafeEqual } from "node:crypto";
import type { Message } from "@/lib/types";
import { store } from "../store";
import { handleOperatorMessage } from "./commands";
import { verifyTwilioSignature } from "./channels/twilio";

export const INBOUND_THREAD = "thr-saqr";

export type InboundResult =
  | { ok: true; sent: Message; replies: Message[] }
  | { ok: false; status: 401 | 400 | 503; error: string };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** The URL Twilio signed: honour the proxy (ngrok) scheme/host so the HMAC matches. */
export function externalUrl(req: Request): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (proto) u.protocol = `${proto.split(",")[0].trim()}:`;
  if (host) u.host = host.split(",")[0].trim();
  return u.toString();
}

export async function inboundGeneric(body: { text?: unknown; secret?: unknown; threadId?: unknown }): Promise<InboundResult> {
  const expected = store.secrets.deliverySecret;
  if (!expected) return { ok: false, status: 503, error: "inbound secret not configured" };
  if (typeof body.secret !== "string" || !safeEqual(body.secret, expected)) return { ok: false, status: 401, error: "bad secret" };
  if (typeof body.text !== "string" || !body.text.trim()) return { ok: false, status: 400, error: "text required" };
  const threadId = typeof body.threadId === "string" && store.thread(body.threadId) ? body.threadId : INBOUND_THREAD;
  const r = await handleOperatorMessage(threadId, body.text.trim());
  return { ok: true, ...r };
}

export async function inboundTwilio(url: string, params: Record<string, string>, signature: string | null): Promise<InboundResult> {
  const token = store.secrets.twilioAuthToken;
  if (!token) return { ok: false, status: 503, error: "twilio auth token not configured" };
  if (!verifyTwilioSignature(token, url, params, signature)) return { ok: false, status: 401, error: "bad twilio signature" };
  const text = (params.Body ?? "").trim();
  if (!text) return { ok: false, status: 400, error: "Body required" };
  const r = await handleOperatorMessage(INBOUND_THREAD, text);
  return { ok: true, ...r };
}
