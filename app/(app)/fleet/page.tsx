"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Wrench } from "@phosphor-icons/react";
import { Area, AreaChart } from "recharts";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { KpiCard } from "@/components/compositions/kpi-card";
import { TraceView } from "@/components/compositions/trace-view";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { BorderBeam } from "@/components/ui/border-beam";
import { BlurFade } from "@/components/ui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, useBootstrap, useMigrations, useServer, useServers } from "@/lib/hooks/use-data";
import { MIGRATION_STATUS_LABEL, SERVER_STATUS_HEX, THREAT_STATUS_CLASS, THREAT_STATUS_LABEL, ago, humanize } from "@/lib/format";
import type { ConformanceCategory, ConformanceCheck, Migration, MigrationReason, Region, Server } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/beautiful-ui/loading-state";

const loadConfig: ChartConfig = { v: { label: "load", color: "var(--color-cerulean)" } };
const CATEGORIES: ConformanceCategory[] = ["patching", "network", "identity", "config", "runtime", "data"];
const REGIONS: Region[] = ["us-east", "us-west", "eu-west", "eu-central", "ap-south", "ap-northeast", "sa-east", "me-central"];
const REASONS: MigrationReason[] = ["capacity", "security", "cost", "compliance", "incident-response", "decommission"];

function CheckDot({ status }: { status: ConformanceCheck["status"] }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "pass" && "bg-lime",
        status === "warn" && "bg-sev-medium",
        status === "fail" && "bg-sev-critical",
      )}
    />
  );
}

function ServerSheet({ serverId, onClose }: { serverId: string | null; onClose: () => void }) {
  const { data, mutate } = useServer(serverId ?? undefined);
  const { data: boot } = useBootstrap();
  const [running, setRunning] = React.useState(false);

  const runChecks = async () => {
    if (!serverId) return;
    setRunning(true);
    try {
      await api.fleet.runConformance(serverId);
      toast.success("Ringo is running conformance on this host");
      setTimeout(() => void mutate(), 2500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start checks");
    } finally {
      setRunning(false);
    }
  };

  const s = data?.server;
  return (
    <Sheet open={Boolean(serverId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[620px] border-line bg-bg-1 sm:max-w-[620px]">
        {s && (
          <>
            <SheetHeader>
              <p className="eyebrow">
                {s.role} · {s.env} · {s.provider} · {s.region}
              </p>
              <SheetTitle className="font-display mono-data text-[26px] font-normal text-text-1">{s.hostname}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-line" style={{ color: SERVER_STATUS_HEX[s.status] }}>
                  {s.status}
                </Badge>
                <span className="mono-data text-text-3">{s.ip}</span>
                <span className="text-text-3">
                  {s.os} · {s.kernel}
                </span>
                {s.cluster && <span className="mono-data text-text-3">cluster {s.cluster}</span>}
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-150px)] px-4 pb-6">
              <div className="grid grid-cols-3 gap-3">
                <Card className="bezel-core col-span-2 gap-0 border-0 p-3">
                  <p className="eyebrow">Load</p>
                  <ChartContainer config={loadConfig} className="mt-1 h-16 w-full aspect-auto">
                    <AreaChart data={s.load.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="load-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-cerulean)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="var(--color-cerulean)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke="var(--color-cerulean)" strokeWidth={1.5} fill="url(#load-fill)" dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ChartContainer>
                </Card>
                <Card className="bezel-core gap-0 border-0 p-3">
                  <p className="eyebrow">Conformance</p>
                  <p className="mono-data mt-1 text-[30px] leading-none text-text-1">{s.conformanceScore}</p>
                  <Progress value={s.conformanceScore} className="mt-2 [&_[data-slot=progress-indicator]]:bg-cerulean" />
                </Card>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="eyebrow">Checks</p>
                  <p className="mt-1 text-[12px] text-text-3">
                    {s.checks.filter((c) => c.status === "fail").length} failing · {s.checks.filter((c) => c.status === "warn").length} warnings · protected by{" "}
                    {s.protectedBy.map((id) => boot?.agents.find((a) => a.id === id)?.name ?? id).join(", ") || "—"}
                  </p>
                </div>
                <Button size="sm" onClick={runChecks} disabled={running} className="gap-1.5">
                  <Wrench weight="bold" className="size-3.5" /> Run checks now
                </Button>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {CATEGORIES.map((cat) => {
                  const checks = s.checks.filter((c) => c.category === cat);
                  if (!checks.length) return null;
                  const worst = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "warn") ? "warn" : "pass";
                  return (
                    <Collapsible key={cat} defaultOpen={worst !== "pass"}>
                      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-bg-2">
                        <CheckDot status={worst} />
                        <span className="text-text-1">{humanize(cat)}</span>
                        <span className="mono-data ml-auto text-[11px] text-text-3">
                          {checks.filter((c) => c.status === "pass").length}/{checks.length} pass
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="ml-2 flex flex-col gap-1 border-l border-line py-1 pl-3">
                          {checks.map((c) => (
                            <li key={c.id} className="flex items-start gap-2 py-1 text-[12px]">
                              <CheckDot status={c.status} />
                              <div className="min-w-0 flex-1">
                                <p className="text-text-1">{c.name}</p>
                                <p className="text-text-3">{c.detail}</p>
                              </div>
                              {c.autoRemediable && c.status !== "pass" && (
                                <span className="mono-data shrink-0 text-[10px] text-lime">auto · {c.remediationTool}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>

              <div className="mt-5">
                <p className="eyebrow">Workloads</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.workloads.map((w) => (
                    <span key={w} className="mono-data rounded-full border border-line px-2 py-0.5 text-[11px] text-text-2">
                      {w}
                    </span>
                  ))}
                  {s.tags.map((t) => (
                    <span key={t} className="rounded-full bg-bg-2 px-2 py-0.5 text-[11px] text-text-3">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>

              {data && data.threats.length > 0 && (
                <div className="mt-5">
                  <p className="eyebrow">Threats on this host</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {data.threats.slice(0, 8).map((t) => (
                      <li key={t.id}>
                        <Link href={`/threats/${t.id}`} className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-bg-2">
                          <span className="min-w-0 flex-1 truncate text-text-1">{t.title}</span>
                          <span className={cn("text-[12px]", THREAT_STATUS_CLASS[t.status])}>{THREAT_STATUS_LABEL[t.status]}</span>
                          <span className="mono-data text-[11px] text-text-3">{ago(t.detectedAt)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data && data.traces.length > 0 && (
                <div className="mt-5">
                  <p className="eyebrow">Latest trace</p>
                  <div className="mt-2 rounded-[12px] bg-bg-0/50 p-3">
                    <TraceView trace={data.traces[0]} agentName={boot?.agents.find((a) => a.id === data.traces[0].agentId)?.name} />
                  </div>
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MigrationCard({ m, servers }: { m: Migration; servers: Server[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fromRef = React.useRef<HTMLDivElement>(null);
  const toRef = React.useRef<HTMLDivElement>(null);
  const src = servers.find((s) => s.id === m.sourceServerId);
  const dst = servers.find((s) => s.id === m.targetServerId);
  const live = m.status === "executing" || m.status === "verifying" || m.status === "dry-run";

  const run = async (action: "approve" | "dry-run" | "execute" | "rollback") => {
    try {
      await api.fleet.migrationAction(m.id, action);
      toast.success(`${humanize(action)} — ${m.title}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update migration");
    }
  };

  return (
    <Card className="bezel-core relative gap-0 overflow-hidden border-0 p-4">
      {live && <BorderBeam size={100} duration={6} colorFrom="#d0ff78" colorTo="#99d6ea" borderWidth={1.5} />}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">
            {humanize(m.reason)} · {m.id}
          </p>
          <h3 className="font-display mt-1 text-[20px] leading-tight text-text-1">{m.title}</h3>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "border-line shrink-0",
            m.status === "completed" && "text-lime",
            live && "text-cerulean",
            (m.status === "failed" || m.status === "rolled-back") && "text-sev-critical",
            m.status === "awaiting-approval" && "text-sev-medium",
          )}
        >
          {MIGRATION_STATUS_LABEL[m.status]}
        </Badge>
      </div>

      <div ref={containerRef} className="relative mt-4 flex items-center justify-between gap-6 rounded-[12px] bg-bg-0/50 p-3">
        <div ref={fromRef} className="z-10 rounded-[10px] bg-bg-2 px-3 py-2">
          <p className="eyebrow text-[9px]">from</p>
          <p className="mono-data text-[12px] text-text-1">{src?.hostname ?? m.sourceServerId}</p>
          <p className="text-[11px] text-text-3">{src ? `${src.region} · ${src.provider}` : ""}</p>
        </div>
        <div className="z-10 text-center">
          <p className="mono-data text-[20px] leading-none text-text-1">{m.progress}%</p>
          <p className="text-[10px] text-text-3">{m.workloads.length} workloads</p>
        </div>
        <div ref={toRef} className="z-10 rounded-[10px] bg-bg-2 px-3 py-2 text-right">
          <p className="eyebrow text-[9px]">to</p>
          <p className="mono-data text-[12px] text-text-1">{dst?.hostname ?? (m.targetSpec ? `new ${m.targetSpec.role}` : "—")}</p>
          <p className="text-[11px] text-text-3">
            {dst ? `${dst.region} · ${dst.provider}` : m.targetSpec ? `${m.targetSpec.region} · ${m.targetSpec.provider}` : ""}
          </p>
        </div>
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={fromRef}
          toRef={toRef}
          curvature={-24}
          duration={live ? 3 : 8}
          pathColor="rgba(217, 217, 214,0.15)"
          gradientStartColor="#d0ff78"
          gradientStopColor="#99d6ea"
        />
      </div>

      <ol className="mt-3 grid grid-cols-6 gap-1.5">
        {m.steps.map((st) => (
          <li key={st.id} className="min-w-0">
            <div
              className={cn(
                "h-1 rounded-full",
                st.status === "done" && "bg-lime",
                st.status === "running" && "bg-cerulean animate-pulse-soft",
                st.status === "failed" && "bg-sev-critical",
                st.status === "skipped" && "bg-bg-3",
                st.status === "pending" && "bg-bg-3",
              )}
            />
            <p className="mt-1 truncate text-[10px] text-text-3">{st.name}</p>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center gap-2">
        <AgentAvatar agentId={m.ownerAgentId} size={18} />
        <span className="text-[11px] text-text-3">
          {servers.length ? "Ringo" : m.ownerAgentId} · updated {ago(m.updatedAt)}
        </span>
        <div className="ml-auto flex gap-1.5">
          {m.status === "awaiting-approval" && (
            <Button size="xs" onClick={() => run("approve")}>
              Approve
            </Button>
          )}
          {m.status === "planned" && (
            <>
              <Button size="xs" variant="secondary" onClick={() => run("dry-run")}>
                Dry run
              </Button>
              <Button size="xs" onClick={() => run("execute")}>
                Execute
              </Button>
            </>
          )}
          {(m.status === "executing" || m.status === "verifying" || m.status === "completed") && (
            <Button size="xs" variant="ghost" className="text-text-2" onClick={() => run("rollback")}>
              Roll back
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function NewMigrationDialog({ servers }: { servers: Server[] }) {
  const [open, setOpen] = React.useState(false);
  const [source, setSource] = React.useState<string>("");
  const [region, setRegion] = React.useState<Region>("eu-west");
  const [reason, setReason] = React.useState<MigrationReason>("capacity");
  const src = servers.find((s) => s.id === source);

  const submit = async () => {
    if (!src) return;
    try {
      await api.fleet.createMigration({
        sourceServerId: src.id,
        targetSpec: { provider: src.provider, region, role: src.role },
        reason,
        workloads: src.workloads,
      });
      toast.success(`Ringo is planning the move for ${src.hostname}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't plan migration");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>New migration</DialogTrigger>
      <DialogContent className="bezel-core border-line">
        <DialogHeader>
          <DialogTitle className="font-display text-[24px] font-normal">Move workloads</DialogTitle>
          <DialogDescription>Ringo plans it, dry-runs it, then executes with a rollback path. Database moves wait for your approval.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-text-2">
            Source server
            <Select value={source} onValueChange={(v) => setSource((v as string) ?? "")} items={Object.fromEntries(servers.map((s) => [s.id, s.hostname]))}>
              <SelectTrigger className="border-line bg-bg-2">
                <SelectValue placeholder="Pick a host" />
              </SelectTrigger>
              <SelectContent className="max-h-72 border-line bg-bg-3">
                {servers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="mono-data">{s.hostname}</span> <span className="text-text-3">· {s.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Target region
              <Select value={region} onValueChange={(v) => setRegion((v as Region) ?? "eu-west")}>
                <SelectTrigger className="border-line bg-bg-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-bg-3">
                  {REGIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Reason
              <Select value={reason} onValueChange={(v) => setReason((v as MigrationReason) ?? "capacity")} items={Object.fromEntries(REASONS.map((r) => [r, humanize(r)]))}>
                <SelectTrigger className="border-line bg-bg-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-bg-3">
                  {REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {humanize(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          {src && (
            <p className="text-[12px] text-text-3">
              Moves {src.workloads.length} workloads: <span className="mono-data text-text-2">{src.workloads.join(", ")}</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!src}>
            Plan migration <ArrowRight weight="bold" className="size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FleetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: servers } = useServers();
  const { data: migrations } = useMigrations();
  const selected = params.get("server");
  const tab = params.get("tab") === "migrations" ? "migrations" : "servers";

  const list = React.useMemo(() => [...(servers ?? [])].sort((a, b) => a.conformanceScore - b.conformanceScore), [servers]);
  const avg = list.length ? Math.round(list.reduce((n, s) => n + s.conformanceScore, 0) / list.length) : 0;
  const count = (st: Server["status"]) => list.filter((s) => s.status === st).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Servers · conformance · migrations"
        title="Fleet"
        description="Ringo conforms every host to baseline, patches what's known, and moves workloads when a server can't be trusted."
        actions={<NewMigrationDialog servers={servers ?? []} />}
      />

      <BlurFade delay={0.05} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Avg conformance" value={avg} suffix="/100" tone="cerulean" />
        <KpiCard label="Isolated" value={count("isolated")} tone="lime" hint="Held by Sundance" />
        <KpiCard label="Compromised" value={count("compromised")} tone="warm" hint="Rebuild or migrate pending" />
        <KpiCard label="Migrating · rebuilding" value={count("migrating") + count("rebuilding")} tone="neutral" />
      </BlurFade>

      <Tabs value={tab} onValueChange={(v) => router.replace(`/fleet${v === "migrations" ? "?tab=migrations" : ""}`)} className="gap-3">
        <TabsList className="w-fit bg-bg-2">
          <TabsTrigger value="servers">Servers ({servers?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="migrations">Migrations ({migrations?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="servers">
          <Card className="bezel-core gap-0 border-0 p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-line hover:bg-transparent">
                  <TableHead className="text-text-3">Host</TableHead>
                  <TableHead className="text-text-3">Role</TableHead>
                  <TableHead className="text-text-3">Where</TableHead>
                  <TableHead className="text-text-3">Status</TableHead>
                  <TableHead className="w-[200px] text-text-3">Conformance</TableHead>
                  <TableHead className="text-text-3">Protected by</TableHead>
                  <TableHead className="text-right text-text-3">Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer border-line hover:bg-bg-2" onClick={() => router.replace(`/fleet?server=${s.id}`)}>
                    <TableCell>
                      <p className="mono-data text-text-1">{s.hostname}</p>
                      <p className="mono-data text-[11px] text-text-3">{s.ip}</p>
                    </TableCell>
                    <TableCell className="text-text-2">{s.role}</TableCell>
                    <TableCell className="text-[12px] text-text-2">
                      {s.region} <span className="text-text-3">· {s.provider} · {s.env}</span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 text-[12px]" style={{ color: SERVER_STATUS_HEX[s.status] }}>
                        <span className="size-2 rounded-full" style={{ background: SERVER_STATUS_HEX[s.status] }} />
                        {s.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={s.conformanceScore}
                          className={cn(
                            "flex-1",
                            s.conformanceScore < 60 ? "[&_[data-slot=progress-indicator]]:bg-sev-critical" : s.conformanceScore < 80 ? "[&_[data-slot=progress-indicator]]:bg-sev-medium" : "[&_[data-slot=progress-indicator]]:bg-cerulean",
                          )}
                        />
                        <span className="mono-data w-7 text-right text-[11px] text-text-2">{s.conformanceScore}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex -space-x-1.5">
                        {s.protectedBy.map((id) => (
                          <span key={id} className="rounded-full ring-2 ring-bg-1">
                            <AgentAvatar agentId={id} size={18} />
                          </span>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell className="mono-data text-right text-[11px] text-text-3">{ago(s.lastSeen)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="migrations">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {[...(migrations ?? [])]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((m) => <MigrationCard key={m.id} m={m} servers={servers ?? []} />)}
            {migrations && migrations.length === 0 && (
              <Card className="bezel-core col-span-full gap-0 border-0 p-8 text-center">
                <p className="font-display text-[22px] text-text-1">No migrations yet.</p>
                <p className="mt-1 text-text-2">Plan one, or wait — Ringo opens one automatically when a host is compromised.</p>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ServerSheet serverId={selected} onClose={() => router.replace(tab === "migrations" ? "/fleet?tab=migrations" : "/fleet")} />
    </div>
  );
}

export default function FleetPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading fleet" variant="orbit" />}>
      <FleetInner />
    </React.Suspense>
  );
}
