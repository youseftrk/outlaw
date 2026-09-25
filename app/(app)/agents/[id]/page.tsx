"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ThinkingOrb } from "thinking-orbs";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { TraceView } from "@/components/compositions/trace-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AnimatedSpan, Terminal } from "@/components/ui/terminal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, useAgent, useBootstrap } from "@/lib/hooks/use-data";
import { useLive } from "@/lib/hooks/use-live";
import { AGENT_STATUS_LABEL, SEVERITY_CLASS, THREAT_STATUS_CLASS, THREAT_STATUS_LABEL, VERDICT_CLASS, ago, clock, humanize } from "@/lib/format";
import type { Autonomy, EventType, Trace } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUTONOMY: { value: Autonomy; label: string; hint: string }[] = [
  { value: "observe", label: "Observe", hint: "Read-only. Reports, never acts." },
  { value: "recommend", label: "Recommend", hint: "Proposes every action for approval." },
  { value: "act-with-approval", label: "Act with approval", hint: "Acts on low risk, asks for medium+." },
  { value: "autonomous", label: "Autonomous", hint: "Acts on servers; policy decides the exceptions." },
];

const LOG_TYPES: EventType[] = ["agent.action", "trace.started", "trace.completed", "message.sent", "agent.status"];

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, mutate } = useAgent(id);
  const { data: boot } = useBootstrap();
  const { events } = useLive();
  const [trace, setTrace] = React.useState<Trace | null>(null);

  const agent = data?.agent;
  const servers = React.useMemo(() => {
    if (!agent) return [];
    if (data?.servers.length) return data.servers;
    return (boot?.servers ?? []).filter((s) => agent.assignedServerIds.includes(s.id) || s.protectedBy.includes(agent.id));
  }, [agent, data?.servers, boot?.servers]);
  const log = React.useMemo(() => {
    const seen = new Set<string>();
    return [...(data?.events ?? []), ...events]
      .filter((e) => e.agentId === id && LOG_TYPES.includes(e.type) && !seen.has(e.id) && seen.add(e.id))
      .slice(-40);
  }, [data?.events, events, id]);

  const setAutonomy = async (value: Autonomy) => {
    if (!agent) return;
    try {
      await api.agents.update(agent.id, { autonomy: value });
      toast.success(`${agent.name} is now ${humanize(value)}`);
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change autonomy");
    }
  };

  const setPaused = async (paused: boolean) => {
    if (!agent) return;
    try {
      await api.agents.update(agent.id, { paused });
      toast.success(paused ? `${agent.name} paused` : `${agent.name} back on duty`);
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update agent");
    }
  };

  if (!agent) {
    return <div className="text-text-3">Loading agent…</div>;
  }

  const busy = agent.status === "investigating" || agent.status === "acting";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={`${agent.callsign} · ${humanize(agent.role)} · trust ${agent.trustLevel}`}
        title={
          <span className="flex items-center gap-4">
            <span className="relative inline-flex">
              <AgentAvatar agent={agent} size={56} face="mouth" interactive />
              {busy && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-background p-0.5">
                  <ThinkingOrb state={agent.status === "acting" ? "working" : "searching"} size={20} theme="dark" />
                </span>
              )}
            </span>
            {agent.name}
          </span>
        }
        description={agent.mandate}
        actions={
          <Button variant="secondary" nativeButton={false} render={<Link href={`/messages?thread=thr-${agent.id.replace("agt-", "")}`} />}>
            Text {agent.name}
          </Button>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <Card className="bezel-core col-span-12 gap-0 border-0 p-4 xl:col-span-4">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Status</p>
            <Badge variant="outline" className={cn("border-line", busy ? "text-lime" : "text-text-2")}>
              {AGENT_STATUS_LABEL[agent.status]}
            </Badge>
          </div>
          {agent.currentTask && <p className="mt-2 text-cerulean">{agent.currentTask}</p>}
          <p className="mono-data mt-2 text-[11px] text-text-3">heartbeat {ago(agent.heartbeatAt)}</p>

          <div className="mt-5 flex items-center justify-between">
            <div>
              <p className="eyebrow">Autonomy</p>
              <p className="mt-1 text-[12px] text-text-3">{AUTONOMY.find((a) => a.value === agent.autonomy)?.hint}</p>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-text-2">
              Paused
              <Switch checked={agent.status === "paused"} onCheckedChange={(v) => setPaused(Boolean(v))} />
            </label>
          </div>
          <ToggleGroup
            value={[agent.autonomy]}
            onValueChange={(v) => {
              const next = (v as Autonomy[])[0];
              if (next && next !== agent.autonomy) void setAutonomy(next);
            }}
            className="mt-3 grid w-full grid-cols-2 gap-1 rounded-[12px] bg-bg-2 p-1"
          >
            {AUTONOMY.map((a) => (
              <ToggleGroupItem
                key={a.value}
                value={a.value}
                className="h-8 rounded-[9px] text-[12px] text-text-2 data-[pressed]:bg-bg-3 data-[pressed]:text-lime"
              >
                {a.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="mt-5">
            <p className="eyebrow">Toolbelt</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {agent.tools.map((t) => (
                <span key={t} className="mono-data rounded-full border border-line px-2 py-0.5 text-[10px] text-text-2">
                  {t}
                </span>
              ))}
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-[12px]">
            {[
              ["Threats handled", agent.metrics.threatsHandled],
              ["Actions", agent.metrics.actionsTaken],
              ["Approvals asked", agent.metrics.approvalsRequested],
              ["Texts sent", agent.metrics.messagesSent],
              ["Policy denials", agent.metrics.policyDenials],
              ["Servers", agent.assignedServerIds.length],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-text-3">{k}</dt>
                <dd className="mono-data text-[16px] text-text-1">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="bezel-core col-span-12 gap-0 border-0 p-0 xl:col-span-8">
          <Tabs defaultValue="log" className="gap-0">
            <TabsList className="m-3 mb-0 w-fit bg-bg-2">
              <TabsTrigger value="log">Live log</TabsTrigger>
              <TabsTrigger value="traces">Traces ({data?.traces.length ?? 0})</TabsTrigger>
              <TabsTrigger value="threats">Threats ({data?.threats.length ?? 0})</TabsTrigger>
              <TabsTrigger value="servers">Servers ({servers.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="log" className="p-3">
              <Terminal className="max-h-[520px] min-h-[320px] w-full max-w-none border-line bg-bg-0" startOnView={false} sequence={false}>
                {log.length === 0 && (
                  <AnimatedSpan className="text-text-3">
                    {`$ tail -f /var/log/qalaa/${agent.id}.log`} — waiting for {agent.name} to move…
                  </AnimatedSpan>
                )}
                {log.map((e) => (
                  <AnimatedSpan key={e.id} className="text-[12px]">
                    <span className="text-text-3">{clock(e.at)}</span>{" "}
                    <span className={e.type === "trace.completed" ? "text-lime" : e.type === "message.sent" ? "text-cerulean" : "text-text-1"}>
                      {e.summary ?? e.type}
                    </span>
                  </AnimatedSpan>
                ))}
              </Terminal>
            </TabsContent>

            <TabsContent value="traces" className="p-3">
              <ScrollArea className="max-h-[520px]">
                <ul className="flex flex-col gap-1">
                  {data?.traces.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setTrace(t)}
                        className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors hover:bg-bg-2"
                      >
                        <span className={cn("size-2 rounded-full", t.verdict === "completed" ? "bg-lime" : t.verdict === "denied" ? "bg-sev-critical" : "bg-cerulean")} />
                        <span className="min-w-0 flex-1 truncate text-text-1">{t.intent}</span>
                        <span className={cn("text-[12px]", VERDICT_CLASS[t.verdict])}>{humanize(t.verdict)}</span>
                        <span className="mono-data w-16 text-right text-[11px] text-text-3">{ago(t.startedAt)}</span>
                      </button>
                    </li>
                  ))}
                  {data?.traces.length === 0 && <li className="p-6 text-center text-text-3">No traces yet.</li>}
                </ul>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="threats" className="p-3">
              <ul className="flex flex-col gap-1">
                {data?.threats.map((t) => (
                  <li key={t.id}>
                    <Link href={`/threats/${t.id}`} className="flex items-center gap-3 rounded-[12px] px-3 py-2 transition-colors hover:bg-bg-2">
                      <span className={cn("eyebrow w-14 text-[10px]", SEVERITY_CLASS[t.severity])}>{t.severity}</span>
                      <span className="min-w-0 flex-1 truncate text-text-1">{t.title}</span>
                      <span className={cn("text-[12px]", THREAT_STATUS_CLASS[t.status])}>{THREAT_STATUS_LABEL[t.status]}</span>
                      <span className="mono-data w-16 text-right text-[11px] text-text-3">{ago(t.detectedAt)}</span>
                    </Link>
                  </li>
                ))}
                {data?.threats.length === 0 && <li className="p-6 text-center text-text-3">Nothing handled yet.</li>}
              </ul>
            </TabsContent>

            <TabsContent value="servers" className="p-3">
              <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {servers.map((s) => (
                  <li key={s.id}>
                    <Link href={`/fleet?server=${s.id}`} className="flex items-center gap-3 rounded-[12px] px-3 py-2 transition-colors hover:bg-bg-2">
                      <span className="mono-data min-w-0 flex-1 truncate text-text-1">{s.hostname}</span>
                      <span className="text-[12px] text-text-3">{s.role}</span>
                      <span className="mono-data text-[11px] text-text-2">{s.conformanceScore}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <Sheet open={Boolean(trace)} onOpenChange={(o) => !o && setTrace(null)}>
        <SheetContent side="right" className="w-[560px] border-line bg-bg-1 sm:max-w-[560px]">
          <SheetHeader>
            <SheetTitle className="eyebrow">Governance trace</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-80px)] px-4 pb-6">{trace && <TraceView trace={trace} agentName={agent.name} />}</ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
