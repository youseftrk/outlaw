"use client";

import { Check, X } from "@phosphor-icons/react";
import type { AuthorityCheck } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The checks the server ran, in order, in plain words. Stops at the first failure — that is why the answer was no. */
export function ChecksList({ checks, className }: { checks: AuthorityCheck[]; className?: string }) {
  if (!checks.length) return null;
  return (
    <ol className={cn("flex flex-col gap-1", className)} aria-label="Checks the server ran">
      {checks.map((c, i) => (
        <li key={`${i}-${c.label}`} className="flex items-center gap-2 text-[12.5px]">
          <span
            className={cn(
              "grid size-4 shrink-0 place-items-center rounded-full",
              c.passed ? "bg-lime/15 text-lime" : "bg-sev-critical/15 text-sev-critical",
            )}
            aria-hidden
          >
            {c.passed ? <Check weight="bold" className="size-2.5" /> : <X weight="bold" className="size-2.5" />}
          </span>
          <span className={c.passed ? "text-text-2" : "font-medium text-text-1"}>{c.label}</span>
        </li>
      ))}
    </ol>
  );
}
