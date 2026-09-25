"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Broadcast,
  ChatsCircle,
  ChartLineUp,
  HardDrives,
  Key,
  Lightning,
  Notebook,
  Play,
  ArrowCounterClockwise,
  Siren,
  Sliders,
  ToggleLeft,
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
  { label: "Home", href: "/", icon: ToggleLeft, key: "G H" },
  { label: "Permissions", href: "/permissions", icon: Key, key: "G P" },
  { label: "What happened", href: "/record", icon: Notebook, key: "G W" },
  { label: "Agents", href: "/agents", icon: UsersThree, key: "G A" },
  { label: "Incidents", href: "/incidents", icon: Siren, key: "G I" },
  { label: "Systems", href: "/systems", icon: HardDrives, key: "G S" },
  { label: "Messages", href: "/messages", icon: ChatsCircle, key: "G M" },
  { label: "Run a drill", href: "/drill", icon: Play, key: "G D" },
  { label: "Why Qalaa", href: "/why", icon: ChartLineUp, key: "G Y" },
  { label: "Live wire", href: "/insights", icon: Broadcast, key: "G L" },
  { label: "Settings", href: "/settings", icon: Sliders, key: "G ," },
];

const DIRECTOR: { label: string; scenario: DirectorScenario; hint: string }[] = [
  { label: "Start an incident: password guessing on the gateway", scenario: "brute-force", hint: "low · routine" },
  { label: "Start an incident: a production server calling out", scenario: "c2-beacon", hint: "high" },
  { label: "Start an incident: someone copying a lot of data", scenario: "exfil", hint: "critical" },
  { label: "Start an incident: an AI model being tricked", scenario: "prompt-injection", hint: "medium" },
  { label: "Start an incident: a key leaked in a public dataset", scenario: "leaked-token", hint: "high · prevention path" },
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
      title="Qalaa command"
      description="Go somewhere, text an agent, or run the demo"
      className="bezel-core border-line"
    >
      <CommandInput placeholder="Where to, or what should happen?" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>Nothing matches. Try “drill”, “Saqr”, or a page name.</CommandEmpty>

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

        <CommandGroup heading="Prove it">
          <CommandItem value="run the drill permission story" onSelect={() => go("/drill")}>
            <Play weight="fill" className="size-4 text-lime" />
            <span>Run the drill: refused, asked, allowed, taken back</span>
          </CommandItem>
          <CommandItem
            value="replay real incident july 2026 protected"
            onSelect={() =>
              run("Replay started — the agents don't know it's a replay", () => api.range.start("hf-2026", "protected", 2), "/drill/replay")
            }
          >
            <Play weight="light" className="size-4 text-text-2" />
            <span>Replay the July 2026 incident with the agents on</span>
          </CommandItem>
          <CommandItem
            value="replay baseline run no agents"
            onSelect={() => run("Baseline started — agents paused", () => api.range.start("hf-2026", "baseline", 4), "/drill/replay")}
          >
            <Play weight="light" className="size-4 text-text-2" />
            <span>Replay it with the agents off (baseline)</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Start an incident">
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
