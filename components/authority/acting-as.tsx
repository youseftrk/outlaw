"use client";

import { Buildings } from "@phosphor-icons/react";

import { AnimatedBackground } from "@/components/ui/animated-background";
import { useActingAs, useEntities } from "@/lib/hooks/use-authority";
import { cn } from "@/lib/utils";

/** "I am acting for…" — decides which desk the person sees. Owners can say yes, no and take back; askers can only ask. */
export function ActingAs({ className }: { className?: string }) {
  const { data: entities = [] } = useEntities();
  const [actingAs, setActingAs] = useActingAs();
  if (!entities.length) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="hidden items-center gap-1 text-[12px] text-text-3 sm:flex">
        <Buildings className="size-3.5" /> I am acting for
      </span>
      <div className="flex rounded-lg border border-line bg-bg-1 p-0.5" role="radiogroup" aria-label="I am acting for">
        <AnimatedBackground
          defaultValue={actingAs}
          onValueChange={(v) => v && setActingAs(v)}
          className="rounded-md bg-bg-3"
          transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
        >
          {entities.map((e) => (
            <button
              key={e.id}
              data-id={e.id}
              type="button"
              role="radio"
              aria-checked={actingAs === e.id}
              className={cn("rounded-md px-2.5 py-1 text-[12.5px] transition-colors", actingAs === e.id ? "text-text-1" : "text-text-3 hover:text-text-2")}
            >
              {e.shortName}
              {e.operatesAgents && <span className="ml-1 text-[10.5px] text-text-3">· runs the agents</span>}
            </button>
          ))}
        </AnimatedBackground>
      </div>
    </div>
  );
}
