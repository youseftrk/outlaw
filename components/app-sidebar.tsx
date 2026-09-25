"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Broadcast,
  ChatsCircle,
  ChartLineUp,
  HardDrives,
  Key,
  Notebook,
  Play,
  Siren,
  Sliders,
  ToggleLeft,
  UsersThree,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ThinkingOrb } from "thinking-orbs";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { SlidingNumber } from "@/components/ui/sliding-number";
import { Status, StatusIndicator, StatusLabel } from "@/components/kibo-ui/status";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { api, useAuthMe, useBootstrap } from "@/lib/hooks/use-data";
import { useLive, useLiveEvent } from "@/lib/hooks/use-live";
import { useDesktopMac } from "@/lib/desktop";
import { ago } from "@/lib/format";
import type { Agent, AgentStatus, EventType, QalaaEvent, Trace } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavItem = { title: string; href: string; icon: typeof Broadcast };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "The switch",
    items: [
      { title: "Home", href: "/", icon: ToggleLeft },
      { title: "Permissions", href: "/permissions", icon: Key },
      { title: "What happened", href: "/record", icon: Notebook },
    ],
  },
  {
    label: "Garrison",
    items: [
      { title: "Agents", href: "/agents", icon: UsersThree },
      { title: "Incidents", href: "/incidents", icon: Siren },
      { title: "Systems", href: "/systems", icon: HardDrives },
      { title: "Messages", href: "/messages", icon: ChatsCircle },
    ],
  },
  {
    label: "Prove it",
    items: [
      { title: "Run a drill", href: "/drill", icon: Play },
      { title: "Why Qalaa", href: "/why", icon: ChartLineUp },
      { title: "Live wire", href: "/insights", icon: Broadcast },
    ],
  },
];

const SETTINGS: NavItem = { title: "Settings", href: "/settings", icon: Sliders };
const ALL_ITEMS = [...GROUPS.flatMap((g) => g.items), SETTINGS];

const SLIDE = { type: "spring", duration: 0.35, bounce: 0 } as const;

/** Active row: flat accent surface plus a 2px lime bar on the leading edge. No glow. */
const NAV_ACTIVE_CLASS =
  "rounded-md bg-sidebar-accent before:absolute before:top-1/2 before:left-0 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-lime before:content-['']";

const LIVE_STATUS = {
  live: { status: "online", label: "Live" },
  connecting: { status: "maintenance", label: "Connecting" },
  reconnecting: { status: "degraded", label: "Reconnecting" },
} as const;

const WORK_EVENTS: EventType[] = ["trace.started", "trace.completed", "agent.action"];

const STATUS_LABEL: Record<AgentStatus, string> = {
  observing: "observing",
  investigating: "investigating",
  acting: "acting",
  "awaiting-approval": "awaiting approval",
  paused: "paused",
  idle: "idle",
};

/** Agents with an open trace (or a very recent action) on the wire, derived from SSE. */
function useWorkingAgents() {
  const [traces, setTraces] = React.useState<Map<string, string>>(() => new Map());
  const [flash, setFlash] = React.useState<Map<string, number>>(() => new Map());

  useLiveEvent(WORK_EVENTS, (e: QalaaEvent) => {
    const agentId = e.agentId;
    if (!agentId) return;
    if (e.type === "trace.started") {
      const id = (e.payload as { trace?: Pick<Trace, "id"> }).trace?.id ?? e.id;
      setTraces((m) => new Map(m).set(id, agentId));
    } else if (e.type === "trace.completed") {
      const id = (e.payload as { trace?: Pick<Trace, "id"> }).trace?.id;
      setTraces((m) => {
        const next = new Map(m);
        if (id) next.delete(id);
        else for (const [k, v] of next) if (v === agentId) next.delete(k);
        return next;
      });
    } else {
      setFlash((m) => new Map(m).set(agentId, Date.now()));
    }
  });

  React.useEffect(() => {
    if (flash.size === 0) return;
    const t = setTimeout(() => {
      const cutoff = Date.now() - 4000;
      setFlash((m) => {
        const kept = [...m].filter(([, at]) => at > cutoff);
        return kept.length === m.size ? m : new Map(kept);
      });
    }, 4200);
    return () => clearTimeout(t);
  }, [flash]);

  return React.useMemo(() => {
    const working = new Set<string>(traces.values());
    for (const id of flash.keys()) working.add(id);
    return working;
  }, [traces, flash]);
}

function LastEvent({ at }: { at: string | null }) {
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="mono-data truncate text-[10px] text-text-3" suppressHydrationWarning>
      {at ? `last event ${ago(at)}` : "waiting for events"}
    </span>
  );
}

function RosterRow({ agent, working, collapsed, reduced }: { agent: Agent; working: boolean; collapsed: boolean; reduced: boolean | null }) {
  const status = agent.status;
  const busy = working || status === "investigating" || status === "acting";
  const avatar = (
    <span className="relative flex shrink-0">
      <AgentAvatar agent={agent} status={status} size={collapsed ? 22 : 20} />
      <AnimatePresence initial={false}>
        {busy && (
          <motion.span
            initial={reduced ? false : { scale: 0.25, opacity: 0, filter: "blur(4px)" }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
            exit={reduced ? undefined : { scale: 0.25, opacity: 0, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="absolute -right-1 -bottom-1 rounded-full bg-sidebar p-px"
          >
            <ThinkingOrb state={status === "acting" ? "working" : "searching"} size={20} theme="dark" style={{ width: 10, height: 10 }} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );

  return (
    <li>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={`/agents/${agent.id}`}
              aria-label={`${agent.name} · ${STATUS_LABEL[status]}`}
              className={cn(
                "flex items-center gap-2 rounded-md text-[12.5px] text-sidebar-foreground outline-none transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                collapsed ? "size-8 justify-center" : "h-8 px-1.5",
              )}
            />
          }
        >
          {avatar}
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate">{agent.name}</span>
              <span className={cn("mono-data shrink-0 text-[10px]", busy ? "text-lime" : "text-text-3")}>{STATUS_LABEL[status]}</span>
            </>
          )}
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!collapsed}>
          <span className="font-medium">{agent.name}</span>
          <span className="text-muted-foreground"> · {STATUS_LABEL[status]}</span>
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const mac = useDesktopMac();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { data } = useBootstrap();
  const { data: me } = useAuthMe();
  const { state: liveState, lastEventAt } = useLive();
  const working = useWorkingAgents();
  const unread = data?.threads.reduce((n, t) => n + t.unread, 0) ?? 0;
  const agents = data?.agents ?? [];
  const canSignOut = !!me?.enabled && !!me?.authenticated;

  const prevUnread = React.useRef(unread);
  const [pulse, setPulse] = React.useState(0);
  React.useEffect(() => {
    if (unread > prevUnread.current) setPulse((n) => n + 1);
    prevUnread.current = unread;
  }, [unread]);
  React.useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(0), 1600);
    return () => clearTimeout(t);
  }, [pulse]);

  const activeHref = ALL_ITEMS.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))?.href;

  const signOut = async () => {
    try {
      await api.auth.logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  const live = LIVE_STATUS[liveState];
  const transition = reduced ? { duration: 0 } : SLIDE;

  const navItem = (item: NavItem) => {
    const active = activeHref === item.href;
    const Icon = item.icon;
    const showBadge = item.href === "/messages" && unread > 0;
    return (
      <SidebarMenuItem key={item.href} data-id={item.href} className="flex [&>div:last-child]:min-w-0 [&>div:last-child]:flex-1">
        <SidebarMenuButton
          tooltip={item.title}
          isActive={active}
          className="relative bg-transparent text-sidebar-foreground transition-colors duration-150 hover:text-sidebar-accent-foreground data-[active=true]:bg-transparent data-[active=true]:font-medium data-[active=true]:text-text-1 hover:data-[active=true]:bg-transparent"
          render={<Link href={item.href} />}
        >
          <Icon weight={active ? "fill" : "regular"} className={cn("size-4! transition-colors duration-150", active && "text-lime")} />
          <span>{item.title}</span>
        </SidebarMenuButton>
        {showBadge && !collapsed && (
          <SidebarMenuBadge className="mono-data overflow-visible rounded-full bg-lime px-1.5 text-[10px] font-semibold text-carbon! peer-data-active/menu-button:text-carbon">
            {pulse > 0 && !reduced && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-lime opacity-60" />}
            <span className="relative">
              <SlidingNumber value={unread} />
            </span>
          </SidebarMenuBadge>
        )}
        {showBadge && collapsed && (
          <span className="pointer-events-none absolute top-1 right-1 flex size-2" aria-hidden>
            {pulse > 0 && !reduced && <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-75" />}
            <span className="relative inline-flex size-2 rounded-full bg-lime" />
          </span>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className={cn("app-drag px-2 pt-3 pb-1", mac && "pt-9")}>
        <Link
          href="/"
          aria-label="Qalaa home"
          className="app-no-drag flex h-8 items-center gap-2.5 rounded-md px-1.5 outline-none transition-colors duration-150 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Image src="/brand/logo.svg" alt="" width={22} height={22} priority className="shrink-0" />
          <Image
            src="/brand/wordmark.png"
            alt="Qalaa"
            width={80}
            height={20}
            priority
            style={{ height: 18, width: "auto" }}
            className="opacity-95 group-data-[collapsible=icon]:hidden"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-0">
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="py-1.5">
            <SidebarGroupLabel className="eyebrow h-6 text-[10px] text-text-3">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                <AnimatedBackground defaultValue={activeHref} className={NAV_ACTIVE_CLASS} transition={transition}>
                  {group.items.map(navItem)}
                </AnimatedBackground>
              </SidebarMenu>
              {group.label === "Garrison" && agents.length > 0 && (
                <ul className={cn("mt-1 flex flex-col gap-px", collapsed ? "items-center" : "ml-1.5 border-l border-sidebar-border pl-1.5")} aria-label="The garrison">
                  {agents.map((a) => (
                    <RosterRow key={a.id} agent={a} working={working.has(a.id)} collapsed={collapsed} reduced={reduced} />
                  ))}
                </ul>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto py-1.5">
          <SidebarGroupContent>
            <SidebarMenu>
              <AnimatedBackground defaultValue={activeHref} className={NAV_ACTIVE_CLASS} transition={transition}>
                {navItem(SETTINGS)}
              </AnimatedBackground>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t border-sidebar-border px-2 py-2">
        <div className={cn("flex h-6 items-center gap-2", collapsed ? "justify-center" : "px-1")}>
          <Tooltip>
            <TooltipTrigger
              render={<Status status={live.status} className="h-5 gap-1.5 rounded-full border-0 bg-transparent px-0 py-0 text-[10px]" />}
            >
              <StatusIndicator />
              <StatusLabel className="mono-data text-text-2 group-data-[collapsible=icon]:hidden">{live.label}</StatusLabel>
            </TooltipTrigger>
            <TooltipContent side="right" hidden={!collapsed}>
              {live.label}
              {lastEventAt ? ` · last event ${ago(lastEventAt)}` : ""}
            </TooltipContent>
          </Tooltip>
          {!collapsed && (
            <>
              <span className="text-text-3/60" aria-hidden>
                ·
              </span>
              <LastEvent at={lastEventAt} />
            </>
          )}
        </div>
        {canSignOut && (
          <Button variant="ghost" size="sm" onClick={signOut} className="h-7 justify-start px-1 text-[12px] text-text-2 group-data-[collapsible=icon]:hidden">
            Sign out
          </Button>
        )}
        <a
          href="https://rareui.com"
          target="_blank"
          rel="noreferrer"
          className="mono-data truncate px-1 text-[10px] text-text-3/70 transition-colors duration-150 hover:text-text-2 group-data-[collapsible=icon]:hidden"
        >
          Bell &amp; orb by Rare UI
        </a>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
