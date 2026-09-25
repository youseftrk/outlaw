/**
 * Twilio SMS channel via the REST API (no SDK):
 * POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json with
 * basic auth. Plain-text rendering, 1 500-char cap. Also validates inbound
 * `X-Twilio-Signature` (HMAC-SHA1 of url + sorted form params, base64).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryEnvelope } from "../envelope";
import { WEBHOOK_TIMEOUT_MS } from "./webhook";

export const SMS_MAX_CHARS = 1500;

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
}

export function twilioMessagesUrl(accountSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
}

export function renderSms(env: DeliveryEnvelope): string {
  let body = `[Qalaa · ${env.agentName} · ${env.severity}] ${env.text}`;
  if (env.quickReplies.length) {
    body += `\nReply: ${env.quickReplies.map((q) => q.label).join(" / ")}`;
  }
  return body.length > SMS_MAX_CHARS ? `${body.slice(0, SMS_MAX_CHARS - 1)}…` : body;
}

export function basicAuth(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

export async function sendTwilio(env: DeliveryEnvelope, cfg: TwilioConfig): Promise<void> {
  const params = new URLSearchParams({ From: cfg.from, To: cfg.to, Body: renderSms(env) });
  const res = await fetch(twilioMessagesUrl(cfg.accountSid), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth(cfg.accountSid, cfg.authToken) },
    body: params.toString(),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`twilio ${res.status}`);
}

/** Twilio's request signature: HMAC-SHA1(url + sorted "key+value" pairs), base64. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c);
}

/** TwiML reply carrying each agent reply as its own <Message>. */
export function renderTwiml(texts: string[]): string {
  const messages = texts.map((t) => `<Message>${xmlEscape(t.slice(0, SMS_MAX_CHARS))}</Message>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${messages}</Response>`;
}
