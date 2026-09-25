"use client";

import * as React from "react";
import { motion } from "motion/react";
import { ArrowRight } from "@phosphor-icons/react";

import { clock } from "@/lib/format";
import type { AuthorityPath as PathData, AuthorityPathNode } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<AuthorityPathNode["status"], string> = {
  done: "border-lime/40 bg-lime/10 text-text-1",
  current: "border-lime bg-lime/15 text-text-1 shadow-[0_0_0_4px_rgba(208,255,120,0.12)]",
  todo: "border-line bg-bg-2 text-text-3",
  refused: "border-sev-critical/50 bg-sev-critical/10 text-text-1",
};

/**
 * The journey of one permission, drawn from what the server recorded — asker → Qalaa → owner → on → used → off.
 * Nothing here is animated on its own; a node lights up only when the state behind it changed.
 */
export function AuthorityPath({ path, className }: { path: PathData; className?: string }) {
  const byId = React.useMemo(() => new Map(path.nodes.map((n) => [n.id, n])), [path.nodes]);
  // Linear layout: follow edges from the first node.
  const ordered = React.useMemo(() => {
    const next = new Map(path.edges.map((e) => [e.from, e]));
    const out: { node: AuthorityPathNode; edgeLabel?: string }[] = [];
    const seen = new Set<string>();
    let cur: string | undefined = path.nodes[0]?.id;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = byId.get(cur);
      if (!node) break;
      const e = next.get(cur);
      out.push({ node, edgeLabel: e?.label });
      cur = e?.to;
    }
    for (const n of path.nodes) if (!seen.has(n.id)) out.push({ node: n });
    return out;
  }, [path, byId]);

  return (
    <ol className={cn("flex flex-wrap items-stretch gap-y-3", className)} aria-label="How this permission travelled">
      {ordered.map(({ node, edgeLabel }, i) => (
        <li key={node.id} className="flex items-center">
          <motion.div
            layout
            initial={false}
            animate={{ scale: node.status === "current" ? 1.02 : 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className={cn("flex min-w-[9.5rem] flex-col justify-center rounded-lg border px-3 py-2", STATUS[node.status])}
            aria-current={node.status === "current" ? "step" : undefined}
          >
            <span className="text-[10.5px] uppercase tracking-[0.08em] text-text-3">{node.kind === "state" ? "state" : node.kind}</span>
            <span className="text-[13px] font-medium leading-snug">{node.label}</span>
            {node.sublabel && <span className="text-[11.5px] text-text-3">{node.sublabel}</span>}
            {node.at && <span className="mono-data mt-0.5 text-[10.5px] text-text-3">{clock(node.at)}</span>}
          </motion.div>
          {i < ordered.length - 1 && (
            <span className="flex flex-col items-center px-2 text-text-3" aria-hidden>
              <ArrowRight className="size-3.5" />
              {edgeLabel && <span className="mt-0.5 max-w-[6rem] text-center text-[10px] leading-tight">{edgeLabel}</span>}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
