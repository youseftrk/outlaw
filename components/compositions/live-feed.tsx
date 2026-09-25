"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { AnimatedListItem } from "@/components/ui/animated-list";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { useLive } from "@/lib/hooks/use-live";
import { clock, SEVERITY_HEX } from "@/lib/format";
import type { EventType, QalaaEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const FEED_TYPES: EventType[] = [
  "threat.detected",
  "threat.updated",
  "agent.action",
  "message.sent",
  "approval.requested",
  "approval.decided",
  "migration.updated",
  "range.step",
  "range.run",
  "trace.completed",
];

function describe(e: QalaaEvent) {
  if (e.summary) return e.summary;
  const p = e.payload as Record<string, unknown> | undefined;
  for (const k of ["summary", "text", "title", "intent", "label"]) {
    const v = p?.[k];
    if (typeof v === "string" && v) return v;
  }
  return e.type.replace(".", " · ");
}

/** Live event feed built on Magic UI's AnimatedListItem (spring entry, layout shift). */
export function LiveFeed({ limit = 14, types = FEED_TYPES, className }: { limit?: number; types?: EventType[]; className?: string }) {
  const { events } = useLive();
  const items = React.useMemo(
    () => events.filter((e) => types.includes(e.type)).slice(-limit).reverse(),
    [events, types, limit],
  );

  if (items.length === 0) {
    return (
      <div className={cn("relative flex h-full min-h-40 flex-col items-center justify-center overflow-hidden p-6 text-center", className)}>
        <FlickeringGrid
          className="absolute inset-0 -z-10 motion-reduce:hidden"
          squareSize={3}
          gridGap={5}
          color="#99d6ea"
          maxOpacity={0.18}
          flickerChance={0.08}
        />
        <p className="text-text-2">Quiet on the wire.</p>
        <p className="mt-1 text-[12px] text-text-3">Agent actions, detections and texts land here as they happen.</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <AnimatePresence initial={false}>
        {items.map((e) => {
          const row = (
            <div className="flex items-start gap-3 rounded-[12px] px-2.5 py-2 transition-colors hover:bg-bg-2">
              {e.agentId ? (
                <AgentAvatar agentId={e.agentId} size={22} className="mt-0.5 shrink-0" />
              ) : (
                <span
                  className="mt-2 size-2 shrink-0 rounded-full"
                  style={{ background: e.severity ? SEVERITY_HEX[e.severity] : "var(--color-text-3)" }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-5 text-text-1">{describe(e)}</p>
                <p className="mono-data text-[11px] text-text-3">
                  {clock(e.at)}
                  <span className="mx-1.5 opacity-50">·</span>
                  {e.type}
                </p>
              </div>
            </div>
          );
          return (
            <AnimatedListItem key={e.id}>
              {e.href ? (
                <Link href={e.href} className="block rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {row}
                </Link>
              ) : (
                row
              )}
            </AnimatedListItem>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
