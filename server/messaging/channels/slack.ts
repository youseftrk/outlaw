/**
 * Slack incoming-webhook channel: the envelope rendered as Block Kit.
 * Severity → emoji + attachment colour; quick replies become text hints.
 */
import type { Severity } from "@/lib/types";
import type { DeliveryEnvelope } from "../envelope";
import { WEBHOOK_TIMEOUT_MS } from "./webhook";

export const SLACK_SEVERITY: Record<Severity, { emoji: string; color: string }> = {
  info: { emoji: ":information_source:", color: "#8aa0b3" },
  low: { emoji: ":large_blue_circle:", color: "#3a8fd6" },
  medium: { emoji: ":large_yellow_circle:", color: "#e0b13a" },
  high: { emoji: ":large_orange_circle:", color: "#f0863a" },
  critical: { emoji: ":red_circle:", color: "#e5484d" },
};

export function isSlackUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("hooks.slack.com");
  } catch {
    return false;
  }
}

export interface SlackPayload {
  text: string;
  attachments: {
    color: string;
    blocks: Array<
      | { type: "section"; text: { type: "mrkdwn"; text: string } }
      | { type: "context"; elements: { type: "mrkdwn"; text: string }[] }
    >;
  }[];
}

export function renderSlack(env: DeliveryEnvelope): SlackPayload {
  const sev = SLACK_SEVERITY[env.severity];
  const header = `${sev.emoji} *${env.agentName}* · ${env.kind} · ${env.severity}`;
  const blocks: SlackPayload["attachments"][number]["blocks"] = [
    { type: "section", text: { type: "mrkdwn", text: `${header}\n${env.text}` } },
  ];
  if (env.quickReplies.length) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Reply: ${env.quickReplies.map((q) => `\`${q.command}\``).join(" / ")}` }],
    });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Qalaa · ${env.href} · ${env.sentAt}` }] });
  return {
    text: `[Qalaa · ${env.agentName} · ${env.severity}] ${env.text}`,
    attachments: [{ color: sev.color, blocks }],
  };
}

export async function sendSlack(env: DeliveryEnvelope, cfg: { url: string }): Promise<void> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(renderSlack(env)),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`slack ${res.status}`);
}
