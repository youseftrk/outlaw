"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Broadcast,
  ChatsCircle,
  ChartLineUp,
  Crosshair,
  Gavel,
  HardDrives,
  Lightning,
  MagnifyingGlass,
  Play,
  ArrowCounterClockwise,
  Sliders,
  Target,
  UsersThree,
} from "@phosphor-icons/react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { api } from "@/lib/api";
import { useBootstrap } from "@/lib/hooks/use-data";
import type { DirectorScenario } from "@/lib/types";

const PAGES = [
  { label: "Command center", href: "/", icon: Broadcast, key: "G C" },
  { label: "Agents", href: "/agents", icon: UsersThree, key: "G A" },
  { label: "Threats", href: "/threats", icon: Crosshair, key: "G T" },
  { label: "Fleet", href: "/fleet", icon: HardDrives, key: "G F" },
  { label: "Governance", href: "/governance", icon: Gavel, key: "G G" },
  { label: "Messages", href: "/messages", icon: ChatsCircle, key: "G M" },
  { label: "Research", href: "/research", icon: MagnifyingGlass, key: "G R" },
  { label: "Insights", href: "/insights", icon: ChartLineUp, key: "G I" },
  { label: "Range", href: "/range", icon: Target, key: "G X" },
  { label: "Settings", href: "/settings", icon: Sliders, key: "G S" },
];

const DIRECTOR: { label: string; scenario: DirectorScenario; hint: string }[] = [
  { label: "Inject brute-force burst on bastion", scenario: "brute-force", hint: "low · routine" },
  { label: "Inject C2 beacon from a prod node", scenario: "c2-beacon", hint: "high" },
  { label: "Inject bulk-read exfil attempt", scenario: "exfil", hint: "critical" },
  { label: "Inject prompt-injection against inference", scenario: "prompt-injection", hint: "medium" },
  { label: "Inject leaked write token in a public dataset", scenario: "leaked-token", hint: "high · prevention path" },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { data } = useBootstrap();
  const agents = data?.agents ?? [];

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const run = async (label: string, fn: () => Promise<unknown>, after?: string) => {
    onOpenChange(false);
    try {
      await fn();
      toast.success(label);
      if (after) router.push(after);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't go through");
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Outlaw command"
      description="Navigate, text an agent, or direct the demo"
      className="bezel-core border-line"
    >
      <CommandInput placeholder="Where to, or what should the gang do?" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Nothing matches. Try “range”, “Cassidy”, or a page name.</CommandEmpty>

        <CommandGroup heading="Go to">
          {PAGES.map((p) => (
            <CommandItem key={p.href} value={`go ${p.label}`} onSelect={() => go(p.href)}>
              <p.icon weight="light" className="size-4 text-text-2" />
              <span>{p.label}</span>
              <CommandShortcut className="mono-data">{p.key}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Text an agent">
          {agents.map((a) => (
            <CommandItem
              key={a.id}
              value={`text ${a.name} ${a.role}`}
              onSelect={() => go(`/messages?thread=thr-${a.id.replace("agt-", "")}`)}
            >
              <AgentAvatar agent={a} size={18} />
              <span>
                Text {a.name}
                <span className="text-text-3"> · {a.role}</span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Range">
          <CommandItem
            value="start range protected july 2026 replay"
            onSelect={() =>
              run("Replay started — the gang doesn't know", () => api.range.start("hf-2026", "protected", 2), "/range")
            }
          >
            <Play weight="fill" className="size-4 text-lime" />
            <span>Start the July 2026 replay (protected)</span>
          </CommandItem>
          <CommandItem
            value="start range baseline run"
            onSelect={() => run("Baseline run started — agents paused", () => api.range.start("hf-2026", "baseline", 4), "/range")}
          >
            <Play weight="light" className="size-4 text-text-2" />
            <span>Run the baseline (no agents)</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Director">
          {DIRECTOR.map((d) => (
            <CommandItem key={d.scenario} value={`director ${d.label}`} onSelect={() => run(d.label, () => api.director(d.scenario))}>
              <Lightning weight="light" className="size-4 text-sev-high" />
              <span>{d.label}</span>
              <CommandShortcut className="normal-case tracking-normal">{d.hint}</CommandShortcut>
            </CommandItem>
          ))}
          <CommandItem
            value="director reset demo"
            onSelect={() => run("Demo reset — fresh seed", () => api.director("reset-demo"), "/")}
          >
            <ArrowCounterClockwise weight="light" className="size-4 text-text-2" />
            <span>Reset the demo</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
