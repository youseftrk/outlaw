import { rt, json, err } from "@/app/api/_lib/util";
import { externalUrl, inboundGeneric, inboundTwilio } from "@/server/messaging/inbound";
import { renderTwiml } from "@/server/messaging/channels/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator replies from a real channel.
 *  - Twilio: application/x-www-form-urlencoded (Body, From, …) + X-Twilio-Signature → TwiML reply
 *  - generic: application/json { text, secret, threadId? } → { sent, replies }
 */
export async function POST(req: Request) {
  rt();
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await req.formData();
    const params: Record<string, string> = {};
    form.forEach((v, k) => {
      if (typeof v === "string") params[k] = v;
    });
    const r = await inboundTwilio(externalUrl(req), params, req.headers.get("x-twilio-signature"));
    if (!r.ok) return err(r.error, r.status);
    return new Response(renderTwiml(r.replies.map((m) => m.text)), { headers: { "content-type": "text/xml" } });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("invalid JSON body");
  }
  if (!body || typeof body !== "object") return err("invalid JSON body");
  const r = await inboundGeneric(body as { text?: unknown; secret?: unknown; threadId?: unknown });
  if (!r.ok) return err(r.error, r.status);
  return json({ sent: r.sent, replies: r.replies });
}
