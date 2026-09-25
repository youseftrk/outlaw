"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretDown } from "@phosphor-icons/react";

import { ChecksList } from "@/components/authority/checks-list";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ago, clock } from "@/lib/format";
import type { DecisionKind, DecisionRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND: Record<DecisionKind, { label: string; dot: string }> = {
  asked: { label: "Asked", dot: "bg-sev-medium" },
  accepted: { label: "Owner said yes", dot: "bg-lime" },
  declined: { label: "Owner said no", dot: "bg-text-3" },
  "step-up-sent": { label: "Code sent", dot: "bg-sev-medium" },
  "step-up-passed": { label: "Code accepted", dot: "bg-lime" },
  "step-up-failed": { label: "Wrong code", dot: "bg-sev-critical" },
  activated: { label: "Permission on", dot: "bg-lime" },
  allowed: { label: "Allowed", dot: "bg-lime" },
  refused: { label: "Refused", dot: "bg-sev-critical" },
  revoked: { label: "Taken back", dot: "bg-sev-critical" },
  expired: { label: "Ran out", dot: "bg-text-3" },
  "rules-changed": { label: "Rules changed", dot: "bg-cerulean" },
  reset: { label: "Reset", dot: "bg-text-3" },
};

/** The record: one line per thing that happened, newest first, written by the server. */
export function RecordList({ records, className, limit, dense }: { records: DecisionRecord[]; className?: string; limit?: number; dense?: boolean }) {
  const rows = limit ? records.slice(0, limit) : records;
  if (!rows.length) {
    return (
      <div className={cn("rounded-lg border border-dashed border-line p-6 text-center text-[13px] text-text-3", className)}>
        Nothing has happened yet. Every ask, yes, no, action and take-back will show up here.
      </div>
    );
  }
  return (
    <ol className={cn("flex flex-col", className)} aria-label="What happened">
      <AnimatePresence initial={false}>
        {rows.map((r) => (
          <motion.li
            key={r.id}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={cn("flex gap-3 border-b border-line last:border-0", dense ? "py-2" : "py-3")}
          >
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", KIND[r.kind].dot)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium text-text-1">{KIND[r.kind].label}</span>
                <span className="text-[12px] text-text-3">{r.actorName}</span>
                <time dateTime={r.at} title={clock(r.at)} className="mono-data ml-auto text-[11px] text-text-3">
                  {ago(r.at)}
                </time>
              </div>
              <p className="text-[13px] text-text-2">{r.summary}</p>
              {r.checks && r.checks.length > 0 && (
                <Collapsible className="mt-1">
                  <CollapsibleTrigger className="group flex items-center gap-1 text-[11.5px] text-text-3 hover:text-text-2">
                    Why <CaretDown className="size-3 transition-transform group-data-[panel-open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ChecksList checks={r.checks} className="mt-1.5" />
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
