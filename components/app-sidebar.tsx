"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Broadcast,
  ChatsCircle,
  ChartLineUp,
  Crosshair,
  Gavel,
  HardDrives,
  MagnifyingGlass,
  Sliders,
  Target,
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
import { BorderTrail } from "@/components/ui/border-trail";
import { Magnetic } from "@/components/ui/magnetic";
import { SlidingNumber } from "@/components/ui/sliding-number";
import { Status, StatusIndicator, StatusLabel } from "@/components/kibo-ui/status";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { api, useAuthMe, useBootstrap } from "@/lib/hooks/use-data";
import { useLive, useLiveEvent } from "@/lib/hooks/use-live";
import { useDesktopMac } from "@/lib/desktop";
import { ago } from "@/lib/format";
import type { AgentStatus, EventType, QalaaEvent, Trace } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { title: "Command center", href: "/", icon: Broadcast },
  { title: "Agents", href: "/agents", icon: UsersThree },
  { title: "Threats", href: "/threats", icon: Crosshair },
  { title: "Fleet", href: "/fleet", icon: HardDrives },
  { title: "Governance", href: "/governance", icon: Gavel },
  { title: "Messages", href: "/messages", icon: ChatsCircle },
  { title: "Research", href: "/research", icon: MagnifyingGlass },
  { title: "Insights", href: "/insights", icon: ChartLineUp },
  { title: "Range", href: "/range", icon: Target },
] as const;

const SLIDE = { type: "spring", bounce: 0.18, duration: 0.5 } as const;

const NAV_ACTIVE_CLASS =
  "rounded-md bg-sidebar-accent shadow-[inset_0_0_0_1px_rgba(208,255,120,0.14),0_0_22px_-8px_rgba(208,255,120,0.55)] before:absolute before:top-1/2 before:left-0 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-lime before:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:bg-[radial-gradient(120%_120%_at_0%_50%,rgba(208,255,120,0.14),transparent_60%)] after:content-['']";

const LIVE_STATUS = {
  live: { status: "online", label: "Live" },
  connecting: { status: "maintenance", label: "Connecting" },
  reconnecting: { status: "degraded", label: "Reconnecting" },
} as const;

const WORK_EVENTS: EventType[] = ["trace.started", "trace.completed", "agent.action"];

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

function liveStatus(base: AgentStatus, working: boolean): AgentStatus {
  if (!working || base === "paused" || base === "awaiting-approval") return base;
  return base === "acting" ? "acting" : "investigating";
}

function LastEvent({ at }: { at: string | null }) {
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="mono-data text-[10px] text-text-3" suppressHydrationWarning>
      {at ? `last event ${ago(at)}` : "waiting for events"}
    </span>
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
  const [wordmarkHover, setWordmarkHover] = React.useState(false);

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

  const activeHref =
    NAV.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)))?.href ??
    (pathname.startsWith("/settings") ? "/settings" : undefined);

  const signOut = async () => {
    try {
      await api.auth.logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  const live = LIVE_STATUS[liveState];

  const navItem = (item: { title: string; href: string; icon: typeof Broadcast }) => {
    const active = activeHref === item.href;
    const Icon = item.icon;
    return (
      <SidebarMenuItem key={item.href} data-id={item.href} className="flex [&>div:last-child]:min-w-0 [&>div:last-child]:flex-1">
        <SidebarMenuButton
          tooltip={item.title}
          isActive={active}
          className="relative bg-transparent transition-colors duration-300 data-[active=true]:bg-transparent data-[active=true]:text-lime hover:data-[active=true]:bg-transparent"
          render={<Link href={item.href} />}
        >
          <Magnetic intensity={0.35} range={48} actionArea="parent" springOptions={{ stiffness: 220, damping: 18, mass: 0.4 }}>
            <Icon weight={active ? "fill" : "light"} className={cn("size-[18px]! transition-transform duration-300", active && "drop-shadow-[0_0_8px_rgba(208,255,120,0.55)]")} />
          </Magnetic>
          <span>{item.title}</span>
        </SidebarMenuButton>
        {item.href === "/messages" && unread > 0 && (
          <SidebarMenuBadge className="mono-data overflow-visible bg-lime text-[10px] font-semibold text-carbon">
            {pulse > 0 && !reduced && (
              <span aria-hidden className="absolute inset-0 animate-ping rounded-md bg-lime opacity-70" />
            )}
            <span className="relative">
              <SlidingNumber value={unread} />
            </span>
          </SidebarMenuBadge>
        )}
        {item.href === "/messages" && unread > 0 && collapsed && (
          <span className="pointer-events-none absolute top-1 right-1 flex size-2">
            {pulse > 0 && !reduced && <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-75" />}
            <span className="relative inline-flex size-2 rounded-full bg-lime" />
          </span>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className={cn("app-drag", mac && "pt-9")}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="app-no-drag data-[slot=sidebar-menu-button]:p-1.5! hover:bg-transparent"
              render={<Link href="/" aria-label="Qalaa home" />}
              onMouseEnter={() => setWordmarkHover(true)}
              onMouseLeave={() => setWordmarkHover(false)}
            >
              <motion.span
                className="relative grid size-8 shrink-0 place-items-center rounded-full"
                whileHover={reduced ? undefined : { rotate: 12, scale: 1.06 }}
                transition={{ type: "spring", stiffness: 260, damping: 16 }}
              >
                <span className={cn("aura absolute inset-0 rounded-full opacity-40 blur-md transition-opacity duration-500", wordmarkHover && "opacity-80")} />
                {wordmarkHover && !reduced && (
                  <BorderTrail
                    className="bg-linear-to-l from-lime via-cerulean to-transparent"
                    size={24}
                    transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }}
                  />
                )}
                <Image src="/brand/logo.svg" alt="" width={28} height={28} priority className="relative" />
              </motion.span>
              <Image
                src="/brand/wordmark.png"
                alt="Qalaa"
                width={90}
                height={22}
                priority
                style={{ height: 22, width: "auto" }}
                className={cn("opacity-95 transition-[opacity,filter] duration-500 group-data-[collapsible=icon]:hidden", wordmarkHover && "opacity-100 drop-shadow-[0_0_10px_rgba(208,255,120,0.35)]")}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <AnimatedBackground defaultValue={activeHref} className={NAV_ACTIVE_CLASS} transition={reduced ? { duration: 0 } : SLIDE}>
                {NAV.map(navItem)}
              </AnimatedBackground>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <AnimatedBackground defaultValue={activeHref} className={NAV_ACTIVE_CLASS} transition={reduced ? { duration: 0 } : SLIDE}>
                {navItem({ title: "Settings", href: "/settings", icon: Sliders })}
              </AnimatedBackground>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="eyebrow group-data-[collapsible=icon]:hidden">The gang</SidebarGroupLabel>
          <div className={cn("flex items-center gap-1.5 px-2 pb-1", collapsed && "flex-col gap-2 px-0")}>
            {agents.map((a) => {
              const status = liveStatus(a.status, working.has(a.id));
              const busy = status === "investigating" || status === "acting";
              return (
                <Tooltip key={a.id}>
                  <TooltipTrigger
                    render={
                      <Link
                        href={`/agents/${a.id}`}
                        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    }
                  >
                    <Magnetic intensity={collapsed ? 0.5 : 0.3} range={collapsed ? 56 : 36} actionArea="self">
                      <motion.span
                        className="relative flex rounded-full"
                        whileHover={reduced ? undefined : { scale: collapsed ? 1.35 : 1.2 }}
                        transition={{ type: "spring", stiffness: 300, damping: 18 }}
                      >
                        {busy && !reduced && (
                          <span className="absolute -inset-0.5 animate-ping rounded-full bg-lime/30 [animation-duration:2.2s]" />
                        )}
                        <AgentAvatar agent={a} status={status} size={collapsed ? 22 : 24} className="relative" />
                        <AnimatePresence>
                          {busy && (
                            <motion.span
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 380, damping: 20 }}
                              className="absolute -right-1.5 -bottom-1.5 rounded-full bg-sidebar p-px"
                            >
                              <ThinkingOrb state={status === "acting" ? "working" : "searching"} size={20} theme="dark" style={{ width: 12, height: 12 }} />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.span>
                    </Magnetic>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-muted-foreground"> · {status.replace("-", " ")}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </SidebarGroup>
        <div className={cn("flex items-center justify-between gap-2 px-2 pt-1", collapsed && "justify-center px-0")}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Status
                  status={live.status}
                  className={cn("h-5 gap-1.5 rounded-full border-0 bg-transparent px-1 py-0 text-[10px]", collapsed && "px-0")}
                />
              }
            >
              <StatusIndicator />
              <StatusLabel className="mono-data text-text-2 group-data-[collapsible=icon]:hidden">{live.label}</StatusLabel>
            </TooltipTrigger>
            <TooltipContent side="right" hidden={!collapsed}>
              {live.label}
              {lastEventAt ? ` · last event ${ago(lastEventAt)}` : ""}
            </TooltipContent>
          </Tooltip>
          {!collapsed && <LastEvent at={lastEventAt} />}
        </div>
        {canSignOut && (
          <Button variant="ghost" size="sm" onClick={signOut} className="justify-start text-text-2 group-data-[collapsible=icon]:hidden">
            Sign out
          </Button>
        )}
        <a
          href="https://rareui.com"
          target="_blank"
          rel="noreferrer"
          className="mono-data truncate px-2 pb-1 text-[9px] uppercase tracking-[0.12em] text-text-3/70 transition-colors hover:text-text-2 group-data-[collapsible=icon]:hidden"
        >
          Bell &amp; orb by Rare UI
        </a>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
