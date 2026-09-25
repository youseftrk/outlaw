"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { TraceView } from "@/components/compositions/trace-view";
import WorldMap from "@/components/ui/world-map";
import { Timeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, useBootstrap, useThreat } from "@/lib/hooks/use-data";
import { SEVERITY_CLASS, SEVERITY_HEX, SERVER_STATUS_HEX, THREAT_STATUS_CLASS, THREAT_STATUS_LABEL, ago, clock, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/beautiful-ui/loading-state";

export default function ThreatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, mutate } = useThreat(id);
  const { data: boot } = useBootstrap();
  const agentName = (aid: string) => boot?.agents.find((a) => a.id === aid)?.name ?? aid;

  const act = async (action: "false-positive" | "escalate" | "close") => {
    try {
      await api.threats.action(id, action);
      toast.success(action === "false-positive" ? "Marked as false positive" : action === "escalate" ? "Escalated to the operator" : "Closed");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  };

  if (!data) return <LoadingState label="Loading threat" variant="dots" />;
  const { threat, traces, servers, messages } = data;

  const arcs =
    threat.source.geo && servers.length
      ? servers.map((s) => ({
          start: { lat: threat.source.geo!.lat, lng: threat.source.geo!.lng, label: threat.source.geo!.city },
          end: { lat: s.geo.lat, lng: s.geo.lng, label: s.hostname },
          color: SEVERITY_HEX[threat.severity],
        }))
      : [];
  const markers = servers.map((s) => ({ lat: s.geo.lat, lng: s.geo.lng, color: SERVER_STATUS_HEX[s.status], weight: 2 as const }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <span className={cn("flex items-center gap-1.5", SEVERITY_CLASS[threat.severity])}>
              <span className="size-2 rounded-full" style={{ background: SEVERITY_HEX[threat.severity] }} />
              {threat.severity}
            </span>
            <span>· {humanize(threat.category)}</span>
            <span className="mono-data">· {threat.id}</span>
          </span>
        }
        title={threat.title}
        description={threat.summary}
        actions={
          <>
            <Badge variant="outline" className={cn("h-7 border-line px-3 text-[12px]", THREAT_STATUS_CLASS[threat.status])}>
              {THREAT_STATUS_LABEL[threat.status]}
            </Badge>
            {!["neutralized", "prevented", "false-positive"].includes(threat.status) && (
              <>
                <Button variant="secondary" size="sm" onClick={() => act("escalate")}>
                  Escalate
                </Button>
                <Button variant="secondary" size="sm" onClick={() => act("close")}>
                  Close
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" className="text-text-2" onClick={() => act("false-positive")}>
              False positive
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <Card className="bezel-core col-span-12 gap-0 border-0 p-0 xl:col-span-7">
          <CardHeader className="px-4 pt-4 pb-0">
            <p className="eyebrow">Kill chain</p>
            <CardTitle className="font-display text-[20px] font-normal text-text-1">
              {threat.attack.killChain.filter((k) => k.outcome !== "observed").length} of {threat.attack.killChain.length} stages stopped
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3">
            <Timeline
              data={threat.attack.killChain.map((k) => ({
                title: humanize(k.stage),
                meta: `${clock(k.at)} · ${k.outcome}`,
                tone: k.outcome === "blocked" ? "blocked" : k.outcome === "prevented" ? "prevented" : "observed",
                content: <p>{k.note}</p>,
              }))}
            />
            {threat.attack.techniqueIds.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                <span className="eyebrow mr-1">ATT&CK</span>
                {threat.attack.techniqueIds.map((t) => (
                  <Badge key={t} variant="outline" className="mono-data border-line text-text-2" render={<Link href={`/research?q=${t}`} />}>
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="col-span-12 flex flex-col gap-4 xl:col-span-5">
          <Card className="bezel-core gap-0 border-0 p-4">
            <p className="eyebrow">Source → target</p>
            <div className="mt-2 rounded-[12px] bg-bg-0/60">
              <WorldMap dots={arcs} markers={markers} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <dt className="text-text-3">Origin</dt>
                <dd className="mono-data text-text-1">
                  {threat.source.ip ?? "internal"}
                  {threat.source.geo?.city && <span className="text-text-2"> · {threat.source.geo.city}</span>}
                </dd>
                {threat.source.actorLabel && <dd className="text-text-2">{threat.source.actorLabel}</dd>}
              </div>
              <div>
                <dt className="text-text-3">Targets</dt>
                {servers.map((s) => (
                  <dd key={s.id}>
                    <Link href={`/fleet?server=${s.id}`} className="mono-data text-text-1 hover:text-lime">
                      {s.hostname}
                    </Link>
                    <span className="text-text-3"> · {s.status}</span>
                  </dd>
                ))}
              </div>
              <div>
                <dt className="text-text-3">Detected</dt>
                <dd className="mono-data text-text-1">{clock(threat.detectedAt)} · {ago(threat.detectedAt)}</dd>
              </div>
              <div>
                <dt className="text-text-3">Handled by</dt>
                <dd className="mt-1 flex items-center gap-1.5">
                  {threat.handledBy.map((aid) => (
                    <Link key={aid} href={`/agents/${aid}`} className="flex items-center gap-1 rounded-full bg-bg-2 py-0.5 pl-0.5 pr-2 text-[11px] text-text-1">
                      <AgentAvatar agentId={aid} size={16} /> {agentName(aid)}
                    </Link>
                  ))}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="bezel-core gap-0 border-0 p-0">
            <Tabs defaultValue="traces" className="gap-0">
              <TabsList className="m-3 mb-0 w-fit bg-bg-2">
                <TabsTrigger value="traces">Traces ({traces.length})</TabsTrigger>
                <TabsTrigger value="iocs">IOCs ({threat.iocs.length})</TabsTrigger>
                <TabsTrigger value="texts">Texts ({messages.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="traces" className="flex flex-col gap-4 p-4">
                {traces.length === 0 && <p className="text-text-3">No traces linked yet.</p>}
                {traces.map((t) => (
                  <div key={t.id} className="rounded-[12px] bg-bg-0/50 p-3">
                    <TraceView trace={t} agentName={agentName(t.agentId)} />
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="iocs" className="p-2">
                <Table>
                  <TableHeader>
                    <TableRow className="border-line hover:bg-transparent">
                      <TableHead className="text-text-3">Type</TableHead>
                      <TableHead className="text-text-3">Value</TableHead>
                      <TableHead className="text-text-3">Confidence</TableHead>
                      <TableHead className="text-text-3">Tags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {threat.iocs.map((i) => (
                      <TableRow key={`${i.type}-${i.value}`} className="border-line">
                        <TableCell className="text-text-2">{i.type}</TableCell>
                        <TableCell className="mono-data text-text-1">
                          <Link href={`/research?q=${encodeURIComponent(i.value)}`} className="hover:text-lime">
                            {i.value}
                          </Link>
                        </TableCell>
                        <TableCell className="mono-data text-text-2">{Math.round(i.confidence * 100)}%</TableCell>
                        <TableCell className="text-[11px] text-text-3">{i.tags.join(", ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="texts" className="flex flex-col gap-2 p-4">
                {messages.map((m) => (
                  <div key={m.id} className={cn("max-w-[85%] px-3 py-2 text-[13px]", m.from === "agent" ? "bubble-agent self-start" : "bubble-operator self-end")}>
                    {m.text}
                    <span className="mono-data mt-1 block text-[10px] opacity-60">{clock(m.sentAt)}</span>
                  </div>
                ))}
                {messages.length === 0 && <p className="text-text-3">No texts about this one.</p>}
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
