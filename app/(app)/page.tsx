"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Play } from "@phosphor-icons/react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ThinkingOrb } from "thinking-orbs";

import { PageHeader } from "@/components/shell/page-header";
import { KpiCard } from "@/components/compositions/kpi-card";
import { LiveFeed } from "@/components/compositions/live-feed";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import WorldMap from "@/components/ui/world-map";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { useBootstrap, useInsights } from "@/lib/hooks/use-data";
import { AGENT_STATUS_LABEL, SERVER_STATUS_HEX, SEVERITY_HEX, ago, seconds } from "@/lib/format";
import { cn } from "@/lib/utils";

const timelineConfig: ChartConfig = {
  detected: { label: "Detected", color: "var(--color-sev-high)" },
  neutralized: { label: "Neutralized", color: "var(--color-text-2)" },
  prevented: { label: "Prevented", color: "var(--color-lime)" },
};

function Panel({
  title,
  eyebrow,
  action,
  children,
  className,
  glow,
}: {
  title: React.ReactNode;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <Card className={cn("bezel-core relative gap-0 overflow-hidden border-0 p-0", className)}>
      {glow && <span className="active-ring motion-reduce:hidden" />}
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-4 pt-4 pb-0">
        <div>
          {eyebrow && <CardDescription className="eyebrow mb-1.5">{eyebrow}</CardDescription>}
          <CardTitle className="font-display text-[20px] font-normal leading-none text-text-1">{title}</CardTitle>
        </div>
        {action}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-3">{children}</CardContent>
    </Card>
  );
}

export default function CommandCenter() {
  const { data: boot } = useBootstrap();
  const { data: insights } = useInsights("7d");

  const servers = boot?.servers ?? [];
  const agents = boot?.agents ?? [];
  const threats = boot?.threats ?? [];
  const approvals = (boot?.approvals ?? []).filter((a) => a.status === "pending");
  const activeRun = boot?.range.activeRun ?? null;

  const openThreats = threats.filter((t) => !["neutralized", "prevented", "false-positive"].includes(t.status));
  const recent = [...threats].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, 10);

  const arcs = recent
    .filter((t) => t.source.geo && t.targetServerIds.length)
    .map((t) => {
      const target = servers.find((s) => s.id === t.targetServerIds[0]);
      if (!target) return null;
      return {
        start: { lat: t.source.geo!.lat, lng: t.source.geo!.lng, label: t.source.geo!.city },
        end: { lat: target.geo.lat, lng: target.geo.lng, label: target.hostname },
        color: SEVERITY_HEX[t.severity],
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .slice(0, 7);

  const markers = servers.map((s) => ({
    lat: s.geo.lat,
    lng: s.geo.lng,
    label: s.hostname,
    color: SERVER_STATUS_HEX[s.status],
    weight: (s.status === "compromised" || s.status === "isolated" ? 2 : 1) as 1 | 2,
  }));

  const timeline = (insights?.timeline ?? []).map((p) => ({
    ...p,
    t: new Date(p.t).toLocaleDateString(undefined, { weekday: "short" }),
  }));
  const sparkOf = (key: "detected" | "neutralized" | "prevented") => (insights?.timeline ?? []).map((p) => p[key]);

  const lowest = [...servers].sort((a, b) => a.conformanceScore - b.conformanceScore).slice(0, 5);
  const protectedCount = servers.filter((s) => s.status !== "offline").length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={boot ? `Frontier Hub · ${servers.length} servers · ${agents.length} agents on watch` : "Frontier Hub"}
        title="Command center"
        actions={
          <Button nativeButton={false} render={<Link href="/range" />} className="gap-2 overflow-visible">
            <Play weight="fill" className="size-3.5" />
            {activeRun ? "Watch the replay" : "Start the July 2026 replay"}
            <span className="active-ring motion-reduce:hidden" />
          </Button>
        }
      />

      <BlurFade delay={0.05} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Servers protected" value={protectedCount} hint={`${servers.length - protectedCount} offline`} tone="cerulean" />
        <KpiCard
          label="Threats neutralized · 7d"
          value={insights?.threatsNeutralized ?? 0}
          spark={sparkOf("neutralized")}
          tone="cerulean"
          hint={`${openThreats.length} open right now`}
        />
        <KpiCard
          label="Prevented before use"
          value={insights?.threatsPrevented ?? 0}
          spark={sparkOf("prevented")}
          tone="lime"
          hint="Attack paths closed before the attacker got there"
        />
        <KpiCard
          label="Time to contain"
          value={Math.round(insights?.avgTimeToContainSec ?? 0)}
          suffix="s"
          tone="neutral"
          hint={`Detect in ${seconds(insights?.avgTimeToDetectSec)} on average`}
        />
      </BlurFade>

      <div className="grid grid-cols-12 gap-4">
        <BlurFade delay={0.1} className="col-span-12 xl:col-span-8">
          <Panel
            eyebrow="Threat map"
            title="Where it's coming from"
            action={
              <div className="flex items-center gap-3 text-[11px] text-text-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: SERVER_STATUS_HEX.healthy }} /> healthy
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: SERVER_STATUS_HEX.isolated }} /> isolated
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: SERVER_STATUS_HEX.compromised }} /> compromised
                </span>
              </div>
            }
            className="h-full"
          >
            <WorldMap dots={arcs} markers={markers} />
          </Panel>
        </BlurFade>

        <BlurFade delay={0.15} className="col-span-12 xl:col-span-4">
          <Panel eyebrow="Live" title="On the wire" className="h-full">
            <LiveFeed limit={12} />
          </Panel>
        </BlurFade>

        <BlurFade delay={0.2} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel
            eyebrow="The garrison"
            title="On duty"
            className="h-full"
            action={
              <Button variant="link" size="sm" className="text-text-2" nativeButton={false} render={<Link href="/agents" />}>
                All agents <ArrowUpRight className="size-3.5" />
              </Button>
            }
          >
            <ul className="grid grid-cols-2 gap-2">
              {agents.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/agents/${a.id}`}
                    className="flex items-center gap-3 rounded-[12px] p-2 transition-colors hover:bg-bg-2"
                  >
                    <div className="relative">
                      <AgentAvatar agent={a} size={40} />
                      {(a.status === "investigating" || a.status === "acting") && (
                        <span className="absolute -bottom-1 -right-1 rounded-full bg-bg-1 p-0.5">
                          <ThinkingOrb state={a.status === "acting" ? "working" : "searching"} size={20} theme="dark" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-1">{a.name}</p>
                      <p className="truncate text-[12px] text-text-3">
                        {AGENT_STATUS_LABEL[a.status]}
                        {a.currentTask ? ` · ${a.currentTask}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.25} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel
            eyebrow="Fleet"
            title="Conformance"
            className="h-full"
            action={
              <span className="mono-data text-[22px] leading-none text-text-1">
                {Math.round(insights?.fleetConformanceAvg ?? 0)}
                <span className="text-[13px] text-text-3">/100</span>
              </span>
            }
          >
            <p className="mb-3 text-[12px] text-text-3">Lowest scores — Rahhal works these first.</p>
            <ul className="flex flex-col gap-2.5">
              {lowest.map((s) => (
                <li key={s.id}>
                  <Link href={`/fleet?server=${s.id}`} className="group block">
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="mono-data text-text-1 group-hover:text-lime">{s.hostname}</span>
                      <span className="mono-data text-text-3">{s.conformanceScore}</span>
                    </div>
                    <Progress value={s.conformanceScore} className="[&_[data-slot=progress-indicator]]:bg-cerulean" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.3} className="col-span-12 xl:col-span-4">
          <Panel eyebrow="Needs you" title={approvals.length ? `${approvals.length} waiting` : "Nothing waiting"} className="h-full">
            {approvals.length === 0 ? (
              <p className="text-text-2">The garrison is running autonomously. Approvals only appear for prod rebuilds and database moves.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {approvals.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-[12px] bg-bg-2 p-3">
                    <AgentAvatar agentId={a.agentId} status="awaiting-approval" size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-text-1">{a.summary}</p>
                      <p className="mono-data mt-0.5 text-[11px] text-text-3">
                        {a.id} · {a.toolName} · {ago(a.requestedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Button variant="secondary" size="sm" nativeButton={false} render={<Link href="/governance?tab=approvals" />}>
                Open approvals
              </Button>
              <Button variant="ghost" size="sm" className="text-text-2" nativeButton={false} render={<Link href="/messages" />}>
                Texts
              </Button>
            </div>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.35} className="col-span-12 xl:col-span-8">
          <Panel eyebrow="Seven days" title="Detected · neutralized · prevented" className="h-full">
            <ChartContainer config={timelineConfig} className="h-[220px] w-full aspect-auto">
              <AreaChart data={timeline} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid vertical={false} stroke="rgba(217, 217, 214,0.06)" />
                <XAxis dataKey="t" tickLine={false} axisLine={false} tick={{ fill: "#75787b", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#75787b", fontSize: 11 }} allowDecimals={false} />
                <ChartTooltip cursor={{ stroke: "rgba(217, 217, 214,0.15)" }} content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="detected" stroke="var(--color-detected)" strokeWidth={1.5} fill="var(--color-detected)" fillOpacity={0.14} />
                <Area type="monotone" dataKey="neutralized" stroke="var(--color-neutralized)" strokeWidth={1.5} fill="var(--color-neutralized)" fillOpacity={0.14} />
                <Area type="monotone" dataKey="prevented" stroke="var(--color-prevented)" strokeWidth={2} fill="var(--color-prevented)" fillOpacity={0.18} />
              </AreaChart>
            </ChartContainer>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.4} className="col-span-12 xl:col-span-4">
          <Panel eyebrow="Blind range" title={activeRun ? "Replay in progress" : "July 2026 replay"} glow={Boolean(activeRun && activeRun.status === "running")} className="h-full">
            {activeRun ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-line mono-data uppercase">
                    {activeRun.mode}
                  </Badge>
                  <Badge variant="outline" className="border-line mono-data">
                    {activeRun.speed}×
                  </Badge>
                  <span className="ml-auto text-[12px] text-text-3">
                    step {Math.min(activeRun.currentStepIndex + 1, activeRun.stepResults.length)} of {activeRun.stepResults.length}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {activeRun.stepResults.map((r) => (
                    <span
                      key={r.stepId}
                      className={cn(
                        "h-1.5 rounded-full",
                        r.status === "blocked" && "bg-lime",
                        r.status === "succeeded" && "bg-sev-critical",
                        r.status === "active" && "bg-cerulean animate-pulse-soft",
                        (r.status === "pending" || r.status === "skipped") && "bg-bg-3",
                      )}
                    />
                  ))}
                </div>
                <p className="text-text-2">
                  {activeRun.stepResults.filter((r) => r.status === "blocked").length} stages blocked ·{" "}
                  {activeRun.stepResults.filter((r) => r.status === "succeeded").length} got through
                </p>
                <Button size="sm" nativeButton={false} render={<Link href="/range" />}>
                  Open the range
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-text-2">
                  Replay the autonomous-swarm intrusion that breached a model hub in July 2026. The garrison doesn&apos;t know it&apos;s
                  a drill.
                </p>
                <Button size="sm" nativeButton={false} render={<Link href="/range" />} className="w-fit gap-2">
                  <Play weight="fill" className="size-3" /> Set up the run
                </Button>
              </div>
            )}
          </Panel>
        </BlurFade>
      </div>
    </div>
  );
}
