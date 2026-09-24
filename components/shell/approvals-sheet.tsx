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
import { useApprovals, useBootstrap } from "@/lib/hooks/use-data";
import type { Approval, ToolRisk } from "@/lib/types";

const RISK_CLASS: Record<ToolRisk, string> = {
  read: "sev-info",
  low: "sev-low",
  medium: "sev-medium",
  high: "sev-high",
  destructive: "sev-critical",
};

export function ApprovalsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: approvals, mutate } = useApprovals("pending");
  const { data: boot } = useBootstrap();
  const agentName = (id: string) => boot?.agents.find((a) => a.id === id)?.name ?? id;

  const decide = async (a: Approval, decision: "approve" | "reject") => {
    try {
      await api.governance.decide(a.id, decision);
      toast.success(decision === "approve" ? `Approved ${a.id} — ${agentName(a.agentId)} is on it` : `Rejected ${a.id}`);
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision didn't go through");
    }
  };

  const pending = approvals ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] border-line bg-bg-1 sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Needs you</SheetTitle>
          <SheetDescription>
            Actions the gang is holding for a human. Everything else runs autonomously and is traced.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-140px)] px-4 pb-6">
          {pending.length === 0 ? (
            <div className="mt-8 rounded-[14px] border border-dashed border-line-strong p-6 text-center">
              <p className="font-display text-xl text-text-1">No approvals waiting.</p>
              <p className="mt-1 text-text-2">The gang is riding autonomously.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((a) => (
                <li key={a.id} className="bezel">
                  <div className="bezel-core p-4">
                    <div className="flex items-start gap-3">
                      <AgentAvatar agentId={a.agentId} status="awaiting-approval" size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-1">{agentName(a.agentId)}</span>
                          <Badge variant="outline" className={`mono-data border-line ${RISK_CLASS[a.risk]}`}>
                            {a.risk}
                          </Badge>
                          <span className="mono-data ml-auto text-[11px] text-text-3">{a.id}</span>
                        </div>
                        <p className="mt-1 text-text-2">{a.summary}</p>
                        <p className="mono-data mt-2 text-[11px] text-text-3">
                          {a.toolName} → {a.targets.join(", ")}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm" onClick={() => decide(a, "approve")}>
                        <Check weight="bold" /> Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => decide(a, "reject")}>
                        <X weight="bold" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="link"
                        className="ml-auto text-text-2"
                        nativeButton={false} render={<Link href={`/governance?tab=traces&trace=${a.traceId}`} />}
                      >
                        Open trace
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
