"use client";

import * as React from "react";
import Link from "next/link";
import { CaretDown } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { VERDICT_CLASS, clock, humanize } from "@/lib/format";
import type { Trace, TraceSpan } from "@/lib/types";
import { cn } from "@/lib/utils";

const SPAN_DOT: Record<TraceSpan["status"], string> = {
  ok: "bg-lime",
  denied: "bg-sev-critical",
  error: "bg-sev-high",
  pending: "bg-sev-medium animate-pulse-soft",
};

const KIND_LABEL: Record<TraceSpan["kind"], string> = {
  observe: "Observe",
  reason: "Reason",
  plan: "Plan",
  policy: "Policy",
  approval: "Approval",
  tool: "Tool",
  outcome: "Outcome",
  message: "Message",
};

function durationMs(s: TraceSpan) {
  if (!s.endedAt) return null;
  return new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
}

function Json({ value }: { value: unknown }) {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="mono-data mt-2 max-h-64 overflow-auto rounded-[10px] bg-bg-0 p-3 text-[11px] leading-relaxed text-text-2">
      {text}
    </pre>
  );
}

export function SpanRow({ span, agentName }: { span: TraceSpan; agentName?: string }) {
  const [open, setOpen] = React.useState(span.kind === "policy" && span.status === "denied");
  const hasDetail = Boolean(span.input || span.output || span.policyEvaluations?.length || span.llm);
  const ms = durationMs(span);
  return (
    <li className="relative pl-7">
      <span className={cn("absolute left-[7px] top-[9px] size-2 rounded-full ring-4 ring-bg-1", SPAN_DOT[span.status])} />
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          disabled={!hasDetail}
          className={cn(
            "flex w-full items-start gap-3 rounded-[10px] px-2 py-1.5 text-left transition-colors",
            hasDetail && "hover:bg-bg-2",
          )}
        >
          <span className="eyebrow mt-1 w-16 shrink-0 text-[10px]">{KIND_LABEL[span.kind]}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-text-1">
              {span.kind === "message" && agentName ? `${agentName} texted: ` : ""}
              {span.label}
            </span>
            <span className="mono-data mt-0.5 block text-[11px] text-text-3">
              {clock(span.startedAt)}
              {ms !== null && <span> · {ms} ms</span>}
              {span.toolName && <span> · {span.toolName}</span>}
              {span.status === "denied" && <span className="text-sev-critical"> · denied</span>}
              {span.llm && (
                <span className={span.llm.fallback ? "text-text-3" : "text-cerulean"}>
                  {" "}
                  · {span.llm.fallback ? "deterministic" : `${span.llm.provider} · ${span.llm.model} · ${span.llm.latencyMs} ms`}
                </span>
              )}
            </span>
          </span>
          {hasDetail && (
            <CaretDown className={cn("mt-1 size-3.5 shrink-0 text-text-3 transition-transform", open && "rotate-180")} />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="px-2 pb-2">
          {span.policyEvaluations && span.policyEvaluations.length > 0 && (
            <Table className="mt-2 text-[12px]">
              <TableHeader>
                <TableRow className="border-line hover:bg-transparent">
                  <TableHead className="h-7 text-text-3">Policy</TableHead>
                  <TableHead className="h-7 text-text-3">Effect</TableHead>
                  <TableHead className="h-7 text-text-3">Matched</TableHead>
                  <TableHead className="h-7 text-text-3">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {span.policyEvaluations.map((ev) => (
                  <TableRow key={ev.policyId} className={cn("border-line", !ev.matched && "opacity-50")}>
                    <TableCell className="py-1.5 text-text-1">{ev.policyName}</TableCell>
                    <TableCell className="py-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "mono-data border-line",
                          ev.effect === "allow" && "text-lime",
                          ev.effect === "deny" && "text-sev-critical",
                          ev.effect === "require-approval" && "text-sev-medium",
                        )}
                      >
                        {ev.effect}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 text-text-2">{ev.matched ? "yes" : "no"}</TableCell>
                    <TableCell className="py-1.5 text-text-2">{ev.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {span.input !== undefined && (
            <div>
              <p className="eyebrow mt-3 text-[10px]">input</p>
              <Json value={span.input} />
            </div>
          )}
          {span.output !== undefined && (
            <div>
              <p className="eyebrow mt-3 text-[10px]">output</p>
              <Json value={span.output} />
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function TraceView({ trace, agentName, compact = false }: { trace: Trace; agentName?: string; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {!compact && (
        <div className="flex items-start gap-3">
          <AgentAvatar agentId={trace.agentId} size={36} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[20px] leading-tight text-text-1">{trace.intent}</p>
            <p className="mono-data mt-1 text-[11px] text-text-3">
              {trace.id} · {agentName ?? trace.agentId} · started {clock(trace.startedAt)}
              {trace.endedAt && ` · ended ${clock(trace.endedAt)}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("mono-data border-line", VERDICT_CLASS[trace.verdict])}>
                {humanize(trace.verdict)}
              </Badge>
              {trace.threatId && (
                <Badge variant="outline" className="mono-data border-line text-text-2" render={<Link href={`/threats/${trace.threatId}`} />}>
                  {trace.threatId}
                </Badge>
              )}
              {trace.migrationId && (
                <Badge variant="outline" className="mono-data border-line text-text-2">
                  {trace.migrationId}
                </Badge>
              )}
              <div className="ml-auto flex w-32 items-center gap-2">
                <span className="eyebrow text-[10px]">risk</span>
                <Progress
                  value={trace.riskScore}
                  className={cn(
                    trace.riskScore >= 70 && "[&_[data-slot=progress-indicator]]:bg-sev-critical",
                    trace.riskScore >= 40 && trace.riskScore < 70 && "[&_[data-slot=progress-indicator]]:bg-sev-medium",
                    trace.riskScore < 40 && "[&_[data-slot=progress-indicator]]:bg-cerulean",
                  )}
                />
                <span className="mono-data text-[11px] text-text-2">{trace.riskScore}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      <ol className="relative flex flex-col gap-1 before:absolute before:left-[10px] before:top-2 before:bottom-2 before:w-px before:bg-line-strong">
        {trace.spans.map((s) => (
          <SpanRow key={s.id} span={s} agentName={agentName} />
        ))}
      </ol>
    </div>
  );
}
