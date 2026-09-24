import { formatDistanceToNowStrict, format } from "date-fns";
import type { Severity, ServerStatus, ThreatStatus, AgentStatus, MigrationStatus, TraceVerdict } from "@/lib/types";

export const SEVERITY_CLASS: Record<Severity, string> = {
  info: "sev-info",
  low: "sev-low",
  medium: "sev-medium",
  high: "sev-high",
  critical: "sev-critical",
};

export const SEVERITY_HEX: Record<Severity, string> = {
  info: "#5e7c88",
  low: "#7fd1dc",
  medium: "#ffc857",
  high: "#ff9a5c",
  critical: "#ff5d6c",
};

export const SERVER_STATUS_HEX: Record<ServerStatus, string> = {
  healthy: "#24c7d6",
  degraded: "#ffc857",
  isolated: "#d0ff78",
  compromised: "#ff5d6c",
  migrating: "#7fd1dc",
  rebuilding: "#ff9a5c",
  offline: "#5e7c88",
};

export const THREAT_STATUS_LABEL: Record<ThreatStatus, string> = {
  detected: "Detected",
  investigating: "Investigating",
  contained: "Contained",
  neutralized: "Neutralized",
  prevented: "Prevented",
  escalated: "Escalated",
  "false-positive": "False positive",
};

export const THREAT_STATUS_CLASS: Record<ThreatStatus, string> = {
  detected: "text-sev-high",
  investigating: "text-sev-medium",
  contained: "text-cerulean",
  neutralized: "text-text-2",
  prevented: "text-lime",
  escalated: "text-sev-critical",
  "false-positive": "text-text-3",
};

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Idle",
  observing: "Observing",
  investigating: "Investigating",
  acting: "Acting",
  "awaiting-approval": "Awaiting approval",
  paused: "Paused",
};

export const MIGRATION_STATUS_LABEL: Record<MigrationStatus, string> = {
  planned: "Planned",
  "awaiting-approval": "Awaiting approval",
  "dry-run": "Dry run",
  executing: "Executing",
  verifying: "Verifying",
  completed: "Completed",
  "rolled-back": "Rolled back",
  failed: "Failed",
};

export const VERDICT_CLASS: Record<TraceVerdict, string> = {
  "in-progress": "text-cerulean",
  completed: "text-lime",
  denied: "text-sev-critical",
  "awaiting-approval": "text-sev-medium",
  failed: "text-sev-high",
};

export function ago(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 45_000) return "just now";
  return formatDistanceToNowStrict(d, { addSuffix: true })
    .replace(" minutes", "m")
    .replace(" minute", "m")
    .replace(" hours", "h")
    .replace(" hour", "h")
    .replace(" days", "d")
    .replace(" day", "d")
    .replace(" seconds", "s")
    .replace(" second", "s");
}

export function clock(iso?: string) {
  return iso ? format(new Date(iso), "HH:mm:ss") : "—";
}

export function dayLabel(iso: string) {
  return format(new Date(iso), "EEE d MMM");
}

export function seconds(sec?: number) {
  if (sec === undefined || Number.isNaN(sec)) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
}

export function titleCase(s: string) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanize(s: string) {
  return s.replace(/[-_]/g, " ");
}

export function pct(n: number, digits = 0) {
  return `${n.toFixed(digits)}%`;
}
