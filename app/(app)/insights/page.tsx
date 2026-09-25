"use client";

import * as React from "react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, RadialBar, RadialBarChart, PolarAngleAxis, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { KpiCard } from "@/components/compositions/kpi-card";
import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useBootstrap, useInsights } from "@/lib/hooks/use-data";
import { SEVERITY_HEX, humanize, pct, seconds } from "@/lib/format";
import type { InsightsWindow } from "@/lib/types";

const timelineConfig: ChartConfig = {
  detected: { label: "Detected", color: "var(--color-sev-high)" },
  neutralized: { label: "Neutralized", color: "var(--color-text-2)" },
  prevented: { label: "Prevented", color: "var(--color-lime)" },
};
const catConfig: ChartConfig = { count: { label: "Threats", color: "var(--color-cerulean)" } };
const radialConfig: ChartConfig = { score: { label: "Conformance", color: "var(--color-lime)" } };

function Panel({ title, eyebrow, children, className }: { title: string; eyebrow: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`bezel-core gap-0 border-0 p-0 ${className ?? ""}`}>
      <CardHeader className="px-4 pt-4 pb-0">
        <CardDescription className="eyebrow mb-1.5">{eyebrow}</CardDescription>
        <CardTitle className="font-display text-[20px] font-normal leading-none text-text-1">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-3">{children}</CardContent>
    </Card>
  );
}

export default function InsightsPage() {
  const [window, setWindow] = React.useState<InsightsWindow>("7d");
  const { data } = useInsights(window);
  const { data: boot } = useBootstrap();
  const agentName = (id: string) => boot?.agents.find((a) => a.id === id)?.name ?? id;
  const hostname = (id: string) => boot?.servers.find((s) => s.id === id)?.hostname ?? id;
  const role = (id: string) => boot?.servers.find((s) => s.id === id)?.role ?? "";

  const timeline = (data?.timeline ?? []).map((p) => ({
    ...p,
    t: new Date(p.t).toLocaleDateString(undefined, window === "24h" ? { hour: "numeric" } : { weekday: "short", day: "numeric" }),
  }));
  const byCategory = [...(data?.byCategory ?? [])].sort((a, b) => b.count - a.count).slice(0, 10).map((c) => ({ ...c, category: humanize(c.category) }));
  const bySeverity = (data?.bySeverity ?? []).map((s) => ({ ...s, fill: SEVERITY_HEX[s.severity] }));
  const radial = [{ name: "score", score: Math.round(data?.fleetConformanceAvg ?? 0), fill: "var(--color-lime)" }];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="What the agents have been doing"
        title="Live wire"
        description="The wider view: what the garrison caught, what it prevented, and how healthy the systems are."
        actions={
          <ToggleGroup
            value={[window]}
            onValueChange={(v) => {
              const next = (v as InsightsWindow[])[0];
              if (next) setWindow(next);
            }}
            className="rounded-[10px] bg-bg-2 p-1"
          >
            {(["24h", "7d", "30d"] as InsightsWindow[]).map((w) => (
              <ToggleGroupItem key={w} value={w} className="h-7 rounded-[8px] px-3 text-[12px] text-text-2 data-[pressed]:bg-bg-3 data-[pressed]:text-lime">
                {w}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />

      <BlurFade delay={0.05} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Servers protected" value={data?.protectedServers ?? 0} tone="cerulean" hint={`${data?.protectedWorkloads ?? 0} workloads`} />
        <KpiCard label="Threats detected" value={data?.threatsDetected ?? 0} tone="warm" />
        <KpiCard label="Neutralized" value={data?.threatsNeutralized ?? 0} tone="cerulean" />
        <KpiCard label="Prevented" value={data?.threatsPrevented ?? 0} tone="lime" />
        <KpiCard label="Tokens revoked" value={data?.tokensRevoked ?? 0} tone="lime" hint={`${data?.credentialsRotated ?? 0} secrets rotated`} />
        <KpiCard label="Uptime" value={Number((data?.uptimePct ?? 0).toFixed(2))} suffix="%" format={{ minimumFractionDigits: 2 }} tone="neutral" hint={`contain in ${seconds(data?.avgTimeToContainSec)}`} />
      </BlurFade>

      <div className="grid grid-cols-12 gap-4">
        <BlurFade delay={0.1} className="col-span-12 xl:col-span-8">
          <Panel eyebrow={window} title="Detected · neutralized · prevented">
            <ChartContainer config={timelineConfig} className="h-[240px] w-full aspect-auto">
              <AreaChart data={timeline} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid vertical={false} stroke="rgba(217, 217, 214,0.06)" />
                <XAxis dataKey="t" tickLine={false} axisLine={false} tick={{ fill: "#75787b", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#75787b", fontSize: 11 }} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="detected" stroke="var(--color-detected)" strokeWidth={1.5} fill="var(--color-detected)" fillOpacity={0.14} />
                <Area type="monotone" dataKey="neutralized" stroke="var(--color-neutralized)" strokeWidth={1.5} fill="var(--color-neutralized)" fillOpacity={0.14} />
                <Area type="monotone" dataKey="prevented" stroke="var(--color-prevented)" strokeWidth={2} fill="var(--color-prevented)" fillOpacity={0.18} />
              </AreaChart>
            </ChartContainer>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.15} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel eyebrow="Systems" title="Health average" className="h-full">
            <ChartContainer config={radialConfig} className="mx-auto h-[200px] w-full aspect-auto">
              <RadialBarChart data={radial} startAngle={210} endAngle={-30} innerRadius={70} outerRadius={95}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="score" background={{ fill: "rgba(217, 217, 214,0.06)" }} cornerRadius={8} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="mono-data fill-text-1" style={{ fontSize: 34 }}>
                  {radial[0].score}
                </text>
                <text x="50%" y="64%" textAnchor="middle" className="fill-text-3" style={{ fontSize: 11 }}>
                  of 100
                </text>
              </RadialBarChart>
            </ChartContainer>
            <p className="text-center text-[12px] text-text-3">
              Detect in {seconds(data?.avgTimeToDetectSec)} · contain in {seconds(data?.avgTimeToContainSec)} · {data?.approvalsPending ?? 0} approvals pending
            </p>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.2} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel eyebrow="By category" title="What they're throwing at us" className="h-full">
            <ChartContainer config={catConfig} className="h-[260px] w-full aspect-auto">
              <BarChart data={byCategory} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="category" width={120} tickLine={false} axisLine={false} tick={{ fill: "#bbbcbc", fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 6, 6, 0]} barSize={12} />
              </BarChart>
            </ChartContainer>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.25} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel eyebrow="By severity" title="How bad it got" className="h-full">
            <ul className="flex flex-col gap-2.5">
              {bySeverity.map((s) => {
                const total = bySeverity.reduce((n, x) => n + x.count, 0) || 1;
                return (
                  <li key={s.severity}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 text-text-1">
                        <span className="size-2 rounded-full" style={{ background: s.fill }} /> {s.severity}
                      </span>
                      <span className="mono-data text-text-2">
                        {s.count} <span className="text-text-3">· {pct((s.count / total) * 100)}</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-bg-2">
                      <div className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out-expo)]" style={{ width: pct((s.count / total) * 100), background: s.fill }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.3} className="col-span-12 md:col-span-6 xl:col-span-4">
          <Panel eyebrow="Most defended" title="What the garrison protected" className="h-full">
            <ul className="flex flex-col gap-1">
              {(data?.topProtected ?? []).map((t, i) => (
                <li key={t.serverId}>
                  <Link href={`/systems?server=${t.serverId}`} className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-bg-2">
                    <span className="mono-data w-5 text-[11px] text-text-3">{i + 1}</span>
                    <span className="mono-data min-w-0 flex-1 truncate text-text-1">{hostname(t.serverId)}</span>
                    <span className="text-[11px] text-text-3">{role(t.serverId)}</span>
                    <span className="mono-data text-text-2">{t.threatsBlocked}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.35} className="col-span-12">
          <Panel eyebrow="Leaderboard" title="Agent effectiveness">
            <Table>
              <TableHeader>
                <TableRow className="border-line hover:bg-transparent">
                  <TableHead className="text-text-3">Agent</TableHead>
                  <TableHead className="text-right text-text-3">Threats handled</TableHead>
                  <TableHead className="text-right text-text-3">Actions</TableHead>
                  <TableHead className="text-right text-text-3">Policy denials</TableHead>
                  <TableHead className="text-right text-text-3">Texts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...(data?.byAgent ?? [])]
                  .sort((a, b) => b.handled - a.handled)
                  .map((a) => (
                    <TableRow key={a.agentId} className="border-line">
                      <TableCell>
                        <Link href={`/agents/${a.agentId}`} className="flex items-center gap-2 text-text-1 hover:text-lime">
                          <AgentAvatar agentId={a.agentId} size={22} /> {agentName(a.agentId)}
                        </Link>
                      </TableCell>
                      <TableCell className="mono-data text-right text-text-1">{a.handled}</TableCell>
                      <TableCell className="mono-data text-right text-text-2">{a.actions}</TableCell>
                      <TableCell className="mono-data text-right text-text-2">{a.denials}</TableCell>
                      <TableCell className="mono-data text-right text-text-2">{a.messages}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Panel>
        </BlurFade>
      </div>
    </div>
  );
}
