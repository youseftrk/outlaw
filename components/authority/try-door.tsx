"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretDown, LockKey, LockKeyOpen } from "@phosphor-icons/react";

import { ChecksList } from "@/components/authority/checks-list";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { REFUSAL_LABEL, callProtected, useRefreshAuthority, type ProtectedResult } from "@/lib/hooks/use-authority";
import { CAPABILITY_LABEL, type Capability } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface DoorTarget {
  agentId: string;
  agentName: string;
  capability: Capability;
  serverId: string;
  hostname: string;
  ownerEntityId: string;
  ownerName: string;
}

/**
 * The agent knocks on the owner's door. This is a real call to the protected endpoint —
 * the same one an outside program would hit — so what you see here is what actually happens.
 */
export function TryDoor({ target, className, onResult }: { target: DoorTarget; className?: string; onResult?: (r: ProtectedResult) => void }) {
  const refresh = useRefreshAuthority();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ProtectedResult | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  const knock = async () => {
    setBusy(true);
    try {
      const r = await callProtected({
        ownerEntityId: target.ownerEntityId,
        capability: target.capability,
        actorId: target.agentId,
        serverId: target.serverId,
      });
      setResult(r);
      setAttempt((n) => n + 1);
      onResult?.(r);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const curl = `curl -X POST /api/protected/${target.ownerEntityId}/${target.capability} \\\n  -H 'content-type: application/json' \\\n  -d '{"actorId":"${target.agentId}","serverId":"${target.serverId}"}'`;

  return (
    <Card data-slot="try-door" className={cn("bezel-core gap-0 border-0 p-0", className)}>
      <div className="flex items-center gap-3 p-4">
        <AgentAvatar agentId={target.agentId} size={36} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-1">
            {target.agentName} tries to {CAPABILITY_LABEL[target.capability].toLowerCase()}
          </p>
          <p className="text-[13px] text-text-2">
            on <span className="text-text-1">{target.hostname}</span>, owned by {target.ownerName}
          </p>
        </div>
        <Button onClick={knock} loading={busy} disabled={busy} data-cuelume-press className="shrink-0">
          Try it
        </Button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {result && (
          <motion.div
            key={attempt}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            role="status"
            aria-live="polite"
            className={cn(
              "border-t border-line px-4 py-3",
              result.ok ? "bg-lime/8" : "bg-sev-critical/8",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full",
                  result.ok ? "bg-lime/15 text-lime" : "bg-sev-critical/15 text-sev-critical",
                )}
                aria-hidden
              >
                {result.ok ? <LockKeyOpen weight="fill" className="size-5" /> : <LockKey weight="fill" className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[15px] font-medium", result.ok ? "text-lime" : "text-sev-critical")}>
                  {result.ok ? "Allowed" : "Refused"}
                </p>
                <p className="text-[13px] text-text-2">
                  {result.ok
                    ? `${target.agentName} did it, within the permission ${target.ownerName} gave. It is written to the record.`
                    : result.code
                      ? REFUSAL_LABEL[result.code]
                      : result.message ?? "The owner has not allowed this."}
                </p>
                <ChecksList checks={result.checks} className="mt-2" />
              </div>
            </div>

            <Collapsible className="mt-3">
              <CollapsibleTrigger className="group flex items-center gap-1 text-[12px] text-text-3 hover:text-text-2">
                For engineers <CaretDown className="size-3 transition-transform group-data-[panel-open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mono-data mt-2 overflow-x-auto rounded-md border border-line bg-bg-0 p-3 text-[11.5px] leading-relaxed text-text-2">
                  {curl}
                  {"\n\n"}
                  {`→ HTTP ${result.status}${result.code ? ` ${result.code}` : ""}${result.leaseId ? `  permission ${result.leaseId}` : ""}`}
                </pre>
                <p className="mt-1.5 text-[11.5px] text-text-3">
                  Anyone can run this without the app and get the same answer. The screen never decides — the server does.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
