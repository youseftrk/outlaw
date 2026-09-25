/**
 * Generic webhook channel: POST the JSON envelope, signed with
 * `X-Qalaa-Signature: sha256=<hmac(rawBody, secret)>`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryEnvelope } from "../envelope";

export const WEBHOOK_TIMEOUT_MS = 5000;
export const SIGNATURE_HEADER = "X-Qalaa-Signature";

export function signBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/** Constant-time check of a `sha256=<hex>` signature against the raw body. */
export function verifySignature(rawBody: string, secret: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signBody(rawBody, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function sendWebhook(env: DeliveryEnvelope, cfg: { url: string; secret?: string }): Promise<void> {
  const body = JSON.stringify(env);
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "qalaa-delivery/1" };
  if (cfg.secret) headers[SIGNATURE_HEADER] = signBody(body, cfg.secret);
  const res = await fetch(cfg.url, { method: "POST", headers, body, signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`webhook ${res.status}`);
}
