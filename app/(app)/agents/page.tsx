"use client";

import Link from "next/link";
import { Area, AreaChart } from "recharts";
import { ThinkingOrb } from "thinking-orbs";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar, agentLook } from "@/components/shell/agent-avatar";
import { BlurFade } from "@/components/ui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgents } from "@/lib/hooks/use-data";
import { AGENT_STATUS_LABEL, humanize, seconds } from "@/lib/format";
import { cn } from "@/lib/utils";

const activityConfig: ChartConfig = { v: { label: "activity", color: "var(--color-cerulean)" } };

export default function AgentsPage() {
  const { data: agents } = useAgents();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="The garrison"
        title="Agents"
        description="Six autonomous agents with distinct mandates. Every action they take on a server is evaluated by policy and traced."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!agents &&
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[300px] rounded-[16px] bg-bg-1" />)}
        {agents?.map((a, i) => {
          const look = agentLook(a.id);
          const busy = a.status === "investigating" || a.status === "acting";
          return (
            <BlurFade key={a.id} delay={0.05 * i}>
              <Link href={`/agents/${a.id}`} className="group block h-full rounded-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="bezel-core relative h-full gap-0 overflow-hidden border-0 p-5 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-translate-y-0.5">
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-[0.12] blur-3xl transition-opacity duration-700 group-hover:opacity-25"
                    style={{ background: look.color }}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="relative">
                      <AgentAvatar agent={a} size={72} face="mouth" interactive />
                      {busy && (
                        <span className="absolute -bottom-1 -right-1 rounded-full bg-bg-1 p-0.5">
                          <ThinkingOrb state={a.status === "acting" ? "working" : "searching"} size={20} theme="dark" />
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "border-line",
                          busy ? "text-lime" : a.status === "paused" ? "text-sev-medium" : "text-text-2",
                        )}
                      >
                        {AGENT_STATUS_LABEL[a.status]}
                      </Badge>
                      <Badge variant="outline" className="mono-data border-line text-[10px] text-text-3">
                        {humanize(a.autonomy)} · trust {a.trustLevel}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="eyebrow">
                      {a.callsign} · {humanize(a.role)}
                    </p>
                    <h2 className="font-display mt-1.5 text-[30px] leading-none text-text-1">{a.name}</h2>
                    <p className="mt-2.5 text-text-2">{a.mandate}</p>
                    {a.currentTask && <p className="mt-2 truncate text-[12px] text-cerulean">Now: {a.currentTask}</p>}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {a.tools.map((t) => (
                      <span key={t} className="mono-data rounded-full border border-line px-2 py-0.5 text-[10px] text-text-3">
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3 border-t border-line pt-3">
                    <dl className="grid grid-cols-3 gap-3 text-[12px]">
                      <div>
                        <dt className="text-text-3">Handled</dt>
                        <dd className="mono-data text-text-1">{a.metrics.threatsHandled}</dd>
                      </div>
                      <div>
                        <dt className="text-text-3">Actions</dt>
                        <dd className="mono-data text-text-1">{a.metrics.actionsTaken}</dd>
                      </div>
                      <div>
                        <dt className="text-text-3">Contain</dt>
                        <dd className="mono-data text-text-1">{seconds(a.metrics.avgTimeToContainSec)}</dd>
                      </div>
                    </dl>
                    {a.activity.length > 1 && (
                      <ChartContainer config={activityConfig} className="h-9 w-28 aspect-auto">
                        <AreaChart data={a.activity.map((v, idx) => ({ idx, v }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id={`act-${a.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={look.color} stopOpacity={0.5} />
                              <stop offset="100%" stopColor={look.color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="v" stroke={look.color} strokeWidth={1.5} fill={`url(#act-${a.id})`} dot={false} isAnimationActive={false} />
                        </AreaChart>
                      </ChartContainer>
                    )}
                  </div>
                </Card>
              </Link>
            </BlurFade>
          );
        })}
      </div>
    </div>
  );
}
