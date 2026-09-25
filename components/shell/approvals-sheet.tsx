"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { api } from "@/lib/api";
import { useApprovals, useBootstrap, useTrace } from "@/lib/hooks/use-data";
import { useLive } from "@/lib/hooks/use-live";
import { seconds } from "@/lib/format";
import type { Approval, Server, ToolRisk } from "@/lib/types";

const RISK_CLASS: Record<ToolRisk, string> = {
  read: "sev-info",
  low: "sev-low",
  medium: "sev-medium",
  high: "sev-high",
  destructive: "sev-critical",
};

/** SPEC §7: approvals expire after 10 sim-minutes. */
export const APPROVAL_TTL_SEC = 600;

type Decision = "approve" | "reject";

export function expiresIn(a: Approval, nowIso: string) {
  const left = APPROVAL_TTL_SEC - (new Date(nowIso).getTime() - new Date(a.requestedAt).getTime()) / 1000;
  return Math.max(0, left);
}

export function targetLabel(a: Approval, servers: Server[]) {
  return a.targets.map((t) => servers.find((s) => s.id === t)?.hostname ?? t).join(", ") || "—";
}

export function ApprovalItem({
  approval: a,
  agentName,
  servers,
  nowIso,
  deciding,
  onDecide,
}: {
  approval: Approval;
  agentName: string;
  servers: Server[];
  nowIso: string;
  deciding: Decision | null;
  onDecide: (decision: Decision) => void;
}) {
  const { data: trace } = useTrace(a.traceId);
  // the authority check also writes a "policy" span for the tool, without evaluations — skip it
  const policySpans = trace?.spans.filter((s) => s.kind === "policy" && s.policyEvaluations?.length) ?? [];
  const policySpan = policySpans.find((s) => s.toolName === a.toolName) ?? policySpans[0];
  const gate = policySpan?.policyEvaluations?.find((ev) => ev.matched && ev.effect === "require-approval");
  const busy = deciding !== null;

  return (
    <li className="bezel" data-testid="approval-item" data-approval-id={a.id}>
      <div className="bezel-core p-4">
        <div className="flex items-start gap-3">
          <AgentAvatar agentId={a.agentId} status="awaiting-approval" size={32} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-1">{agentName}</span>
              <Badge variant="outline" className={`mono-data border-line ${RISK_CLASS[a.risk]}`}>
                {a.risk}
              </Badge>
              <span className="mono-data ml-auto text-[11px] text-text-3">{a.id}</span>
            </div>
            <p className="mt-1 text-text-2">{a.summary}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
              <div>
                <dt className="text-text-3">Tool</dt>
                <dd className="mono-data text-text-1">{a.toolName}</dd>
              </div>
              <div>
                <dt className="text-text-3">Target</dt>
                <dd className="mono-data truncate text-text-1">{targetLabel(a, servers)}</dd>
              </div>
              <div>
                <dt className="text-text-3">Risk score</dt>
                <dd className="mono-data text-text-1">{trace ? `${trace.riskScore}/100` : "—"}</dd>
              </div>
              <div>
                <dt className="text-text-3">Expires in</dt>
                <dd className="mono-data text-text-1" data-testid="approval-expiry">
                  {seconds(expiresIn(a, nowIso))}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[12px] text-text-2">
              <span className="text-text-3">Policy · </span>
              {gate ? `${gate.policyName} — ${gate.reason}` : trace ? "no matching policy recorded" : "loading policy…"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => onDecide("approve")}>
            <Check weight="bold" /> {deciding === "approve" ? "Approving…" : "Approve"}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onDecide("reject")}>
            <X weight="bold" /> {deciding === "reject" ? "Rejecting…" : "Reject"}
          </Button>
          <Button size="sm" variant="link" className="ml-auto text-text-2" nativeButton={false} render={<Link href={`/record?tab=traces&trace=${a.traceId}`} />}>
            Open trace
          </Button>
        </div>
      </div>
    </li>
  );
}

export function ApprovalsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: approvals, mutate } = useApprovals("pending");
  const { data: boot } = useBootstrap();
  const { lastEventAt } = useLive();
  const [deciding, setDeciding] = React.useState<{ id: string; decision: Decision } | null>(null);
  const agentName = (id: string) => boot?.agents.find((a) => a.id === id)?.name ?? id;
  const nowIso = lastEventAt ?? boot?.serverTime ?? new Date().toISOString();

  const decide = async (a: Approval, decision: Decision) => {
    setDeciding({ id: a.id, decision });
    try {
      await api.governance.decide(a.id, decision);
      toast.success(decision === "approve" ? `Approved ${a.id} — ${agentName(a.agentId)} is on it` : `Rejected ${a.id}`);
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision didn't go through");
    } finally {
      setDeciding(null);
    }
  };

  const pending = approvals ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] border-line bg-bg-1 sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Needs you</SheetTitle>
          <SheetDescription>
            Actions the garrison is holding for a human. Everything else runs autonomously and is traced.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-140px)] px-4 pb-6">
          {pending.length === 0 ? (
            <div className="mt-8 rounded-[14px] border border-dashed border-line-strong p-6 text-center">
              <p className="font-display text-xl text-text-1">No approvals waiting.</p>
              <p className="mt-1 text-text-2">The garrison is running autonomously.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((a) => (
                <ApprovalItem
                  key={a.id}
                  approval={a}
                  agentName={agentName(a.agentId)}
                  servers={boot?.servers ?? []}
                  nowIso={nowIso}
                  deciding={deciding?.id === a.id ? deciding.decision : null}
                  onDecide={(d) => void decide(a, d)}
                />
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
