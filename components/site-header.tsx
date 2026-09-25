"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command as CommandIcon } from "@phosphor-icons/react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Status, StatusIndicator, StatusLabel } from "@/components/kibo-ui/status";
import { CommandPalette } from "@/components/shell/command-palette";
import { ApprovalsSheet } from "@/components/shell/approvals-sheet";
import { NotificationBell } from "@/components/rare-ui/notification-bell";
import { useLive } from "@/lib/hooks/use-live";
import { useBootstrap } from "@/lib/hooks/use-data";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "": "Command center",
  agents: "Agents",
  threats: "Threats",
  fleet: "Fleet",
  governance: "Governance",
  messages: "Messages",
  research: "Research",
  insights: "Insights",
  range: "Range",
  settings: "Settings",
};

export function SiteHeader() {
  const pathname = usePathname();
  const { state } = useLive();
  const { data } = useBootstrap();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [approvalsOpen, setApprovalsOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const segments = pathname.split("/").filter(Boolean);
  const root = segments[0] ?? "";
  const pending = data?.approvals.filter((a) => a.status === "pending").length ?? 0;
  const operator = data?.settings.operator.name ?? "Operator";
  const initials = operator
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="app-drag flex h-14 shrink-0 items-center gap-2 border-b border-line bg-background/70 backdrop-blur-xl">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="app-no-drag -ml-1 text-text-2" />
        <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-auto" />
        <Breadcrumb>
          <BreadcrumbList className="text-text-2">
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/" />} className="app-no-drag">
                Qalaa
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {segments.length > 1 ? (
                <BreadcrumbLink render={<Link href={`/${root}`} />} className="app-no-drag">
                  {TITLES[root] ?? root}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="text-text-1">{TITLES[root] ?? root}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {segments.length > 1 && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="mono-data text-text-1">{segments[segments.length - 1]}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="app-no-drag ml-auto flex items-center gap-2">
          <Status
            status={state === "live" ? "online" : state === "connecting" ? "maintenance" : "degraded"}
            className={cn("h-7 rounded-full border border-line bg-bg-1 px-2.5 text-[11px]")}
          >
            <StatusIndicator />
            <StatusLabel className="text-text-2">
              {state === "live" ? "Live" : state === "connecting" ? "Connecting" : "Reconnecting"}
            </StatusLabel>
          </Status>

          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-2 border-line bg-bg-1 text-text-2 hover:text-text-1"
            onClick={() => setPaletteOpen(true)}
          >
            <CommandIcon weight="light" className="size-3.5" />
            <span className="hidden sm:inline">Command</span>
            <Kbd className="bg-bg-2 text-[10px]">⌘K</Kbd>
          </Button>

          <NotificationBell
            count={pending}
            size={28}
            color="lime"
            aria-label={`${pending} approvals waiting`}
            className="overflow-visible border border-line bg-bg-1 text-text-2 hover:text-text-1"
            onClick={() => setApprovalsOpen(true)}
          />

          <Link href="/settings" aria-label="Operator settings" className="ml-1 rounded-full">
            <Avatar className="size-7 ring-1 ring-line">
              <AvatarFallback className="bg-bg-2 text-[11px] font-medium text-text-1">{initials}</AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ApprovalsSheet open={approvalsOpen} onOpenChange={setApprovalsOpen} />
    </header>
  );
}
