"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { useBootstrap } from "@/lib/hooks/use-data";
import { useDesktopMac } from "@/lib/desktop";
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

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const mac = useDesktopMac();
  const { data } = useBootstrap();
  const unread = data?.threads.reduce((n, t) => n + t.unread, 0) ?? 0;
  const agents = data?.agents ?? [];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className={cn("app-drag", mac && "pt-9")}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="app-no-drag data-[slot=sidebar-menu-button]:p-1.5! hover:bg-transparent"
              render={<Link href="/" aria-label="Qalaa home" />}
            >
              <span className="relative grid size-8 shrink-0 place-items-center">
                <span className="aura absolute inset-0 rounded-full opacity-40 blur-md" />
                <Image src="/brand/logo.svg" alt="" width={28} height={28} priority className="relative" />
              </span>
              <Image
                src="/brand/wordmark.png"
                alt="Qalaa"
                width={90}
                height={22}
                priority
                style={{ height: 22, width: "auto" }}
                className="opacity-95 group-data-[collapsible=icon]:hidden"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={active}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-lime"
                      render={<Link href={item.href} />}
                    >
                      <Icon weight={active ? "fill" : "light"} className="size-[18px]!" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.href === "/messages" && unread > 0 && (
                      <SidebarMenuBadge className="bg-lime text-carbon mono-data text-[10px] font-semibold">
                        {unread}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Settings"
                  isActive={pathname.startsWith("/settings")}
                  className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-lime"
                  render={<Link href="/settings" />}
                >
                  <Sliders weight="light" className="size-[18px]!" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className="eyebrow group-data-[collapsible=icon]:hidden">The gang</SidebarGroupLabel>
          <div className={cn("flex items-center gap-1.5 px-2 pb-1", collapsed && "flex-col px-0")}>
            {agents.map((a) => (
              <Tooltip key={a.id}>
                <TooltipTrigger
                  render={
                    <Link
                      href={`/agents/${a.id}`}
                      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  }
                >
                  <AgentAvatar agent={a} size={collapsed ? 22 : 24} />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground"> · {a.status.replace("-", " ")}</span>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </SidebarGroup>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
