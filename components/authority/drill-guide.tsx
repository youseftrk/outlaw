"use client";

import * as React from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowCounterClockwise, Play } from "@phosphor-icons/react";

import { AutoPlay } from "@/components/authority/auto-play";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { authorityApi, useDrillState, useRefreshAuthority } from "@/lib/hooks/use-authority";
import type { DrillStep } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORDER: DrillStep[] = ["onboard", "no-permission", "asked", "owner-accepted", "code-needed", "allowed", "acted", "revoked"];
const SHORT: Record<DrillStep, string> = {
  onboard: "Onboard",
  "no-permission": "Refused",
  asked: "Asked",
  "owner-accepted": "Owner said yes",
  "code-needed": "Code needed",
  allowed: "Allowed",
  acted: "Acted",
  revoked: "Taken back",
  expired: "Ran out",
};

/** Where the story is right now and what to do next — read from the server, never guessed on the screen. */
export function DrillGuide({ className, showReset = true }: { className?: string; showReset?: boolean }) {
  const { data } = useDrillState();
  const refresh = useRefreshAuthority();
  const [busy, setBusy] = React.useState(false);

  const reset = async (fromOnboarding: boolean) => {
    setBusy(true);
    try {
      await authorityApi.reset({ fromOnboarding });
      toast.success(
        fromOnboarding
          ? "Clean slate. The system is not under anyone yet — onboard it to begin."
          : "Back to the start. No permissions, nothing on the record.",
      );
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not reset");
    } finally {
      setBusy(false);
    }
  };

  const idx = data ? ORDER.indexOf(data.step) : -1;

  return (
    <div data-slot="drill-guide" className={cn("bezel-core flex flex-col gap-3 p-4", className)}>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Steps">
        {ORDER.map((s, i) => {
          const state = idx < 0 ? "todo" : i < idx ? "done" : i === idx ? "current" : "todo";
          return (
            <li key={s} className="flex items-center gap-1.5">
              <motion.span
                layout
                animate={{ opacity: state === "todo" ? 0.55 : 1 }}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11.5px]",
                  state === "current" && "border-lime bg-lime/15 text-text-1",
                  state === "done" && "border-line-strong text-text-2",
                  state === "todo" && "border-line text-text-3",
                )}
                aria-current={state === "current" ? "step" : undefined}
              >
                {SHORT[s]}
              </motion.span>
              {i < ORDER.length - 1 && <span className="h-px w-2 bg-line-strong" aria-hidden />}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[20px] leading-tight text-text-1">{data?.title ?? "Loading…"}</p>
          {data?.next && (
            <p className="mt-0.5 text-[13px] text-text-2">
              <span className="text-text-3">Next:</span> {data.next}
            </p>
          )}
        </div>
        {showReset && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => reset(true)} loading={busy} disabled={busy} className="gap-1.5 text-text-2">
              <Play className="size-3.5" weight="fill" /> Start the demo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => reset(false)} disabled={busy} className="gap-1.5 text-text-3">
              <ArrowCounterClockwise className="size-3.5" /> Start over
            </Button>
            {data && <AutoPlay system={data.system} className="gap-1.5 text-text-2" />}
          </div>
        )}
      </div>
    </div>
  );
}
