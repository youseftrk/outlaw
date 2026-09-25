"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Plus } from "@phosphor-icons/react";
import { ThinkingOrb } from "thinking-orbs";

import { ActingAs } from "@/components/authority/acting-as";
import { AskDialog } from "@/components/authority/ask-dialog";
import { DrillGuide } from "@/components/authority/drill-guide";
import { OnboardCard } from "@/components/authority/onboard-card";
import { PermissionCard, type Directory } from "@/components/authority/permission-card";
import { RecordList } from "@/components/authority/record-list";
import { TryDoor } from "@/components/authority/try-door";
import { KpiCard } from "@/components/compositions/kpi-card";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { PageHeader } from "@/components/shell/page-header";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActingAs, useDrillState, useEntities, useLeases, useRecords } from "@/lib/hooks/use-authority";
import { useBootstrap } from "@/lib/hooks/use-data";
import { AGENT_STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The demo's one door: Hisn wants to contain a data-authority system. */
const DEMO = { agentId: "agt-hisn", capability: "contain" as const, serverId: "srv-dataset-worker-02" };

function Panel({
  title,
  eyebrow,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("bezel-core relative gap-0 overflow-hidden border-0 p-0", className)}>
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

export default function AuthorityHome() {
  const { data: boot } = useBootstrap();
  const { data: entities = [] } = useEntities();
  const { data: leases = [] } = useLeases();
  const { data: records = [] } = useRecords("?limit=8");
  const { data: drill } = useDrillState();
  const [actingAs] = useActingAs();
  const [asking, setAsking] = React.useState(false);

  const dir: Directory = React.useMemo(
    () => ({ entities, agents: boot?.agents ?? [], servers: boot?.servers ?? [] }),
    [entities, boot],
  );
  const { servers, agents } = dir;

  const active = leases.filter((l) => l.status === "active");
  const waiting = leases.filter((l) => l.status === "pending" || l.status === "pending-step-up");
  const forMe = waiting.filter((l) => l.ownerEntityId === actingAs);
  const closed = leases.filter((l) => l.status === "revoked" || l.status === "expired" || l.status === "declined");
  const byNewest = (a: { requestedAt: string }, b: { requestedAt: string }) => b.requestedAt.localeCompare(a.requestedAt);

  const requester = entities.find((e) => e.operatesAgents) ?? entities[0];
  const demoServer = servers.find((s) => s.id === DEMO.serverId);
  const demoOwner = entities.find((e) => e.id === (drill?.system.ownerEntityId ?? demoServer?.ownerEntityId));
  const needsOnboarding = drill?.step === "onboard";
  const demoAgent = agents.find((a) => a.id === DEMO.agentId);

  const activeByAgent = (id: string) => active.filter((l) => l.agentId === id).length;
  const ownedBy = (id: string) => servers.filter((s) => s.ownerEntityId === id).length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Qalaa · one switch for what AI agents may do"
        title="Permissions"
        description="Every agent here works only with permission from the organisation that owns the system. The owner can take it back in a second, and everything is written down."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActingAs />
            <Button onClick={() => setAsking(true)} className="gap-1.5" data-cuelume-press disabled={!requester}>
              <Plus weight="bold" className="size-3.5" /> Ask for permission
            </Button>
          </div>
        }
      />

      <BlurFade delay={0.05} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Permissions on right now" value={active.length} tone="lime" hint={active.length ? "Each one can be switched off" : "Agents can only look"} />
        <KpiCard label="Waiting for an owner" value={waiting.length} tone={waiting.length ? "cerulean" : "neutral"} hint={forMe.length ? `${forMe.length} for you to decide` : "Nothing needs you"} />
        <KpiCard label="Agents at work" value={agents.length} tone="neutral" hint="None of them has standing access" />
        <KpiCard label="Systems under owners" value={servers.filter((s) => s.ownerEntityId).length} tone="neutral" hint={`${entities.length} organisations`} />
      </BlurFade>

      <BlurFade delay={0.08}>
        <DrillGuide />
      </BlurFade>

      <div className="grid grid-cols-12 gap-4">
        <BlurFade delay={0.1} className="col-span-12 xl:col-span-7">
          <Panel
            eyebrow={forMe.length ? "Needs you" : "Permissions"}
            title={forMe.length ? `${forMe.length} waiting for your yes` : active.length ? "What agents may do right now" : "No permissions on"}
            className="h-full"
            action={
              <Button variant="link" size="sm" className="text-text-2" nativeButton={false} render={<Link href="/permissions" />}>
                All permissions <ArrowUpRight className="size-3.5" />
              </Button>
            }
          >
            <div className="flex flex-col gap-3">
              {[...forMe, ...waiting.filter((l) => l.ownerEntityId !== actingAs), ...active].sort(byNewest).slice(0, 5).map((l) => (
                <PermissionCard key={l.id} lease={l} dir={dir} actingAs={actingAs} />
              ))}
              {waiting.length + active.length === 0 && (
                <p className="rounded-lg border border-dashed border-line p-6 text-center text-[13px] text-text-3">
                  Nothing is allowed beyond looking. Try the door on the right, or ask for permission.
                </p>
              )}
              {closed.length > 0 && (
                <p className="text-[12px] text-text-3">
                  {closed.length} permission{closed.length === 1 ? "" : "s"} taken back, ran out or refused —{" "}
                  <Link href="/permissions?status=closed" className="underline-offset-2 hover:underline">
                    see them
                  </Link>
                  .
                </p>
              )}
            </div>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.15} className="col-span-12 xl:col-span-5">
          <Panel eyebrow={needsOnboarding ? "Step one" : "Try the door"} title={needsOnboarding ? "Put a system under Qalaa" : "See the switch work"} className="h-full">
            {needsOnboarding && drill ? (
              <div className="flex flex-col gap-3">
                <OnboardCard system={drill.system} />
                <Button variant="ghost" size="sm" className="w-fit text-text-2" nativeButton={false} render={<Link href="/drill" />}>
                  Run the whole story step by step <ArrowUpRight className="size-3.5" />
                </Button>
              </div>
            ) : demoServer && demoOwner && demoAgent ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-text-2">
                  This is a real attempt against {demoOwner.shortName}&rsquo;s system. Refused without permission, allowed with it, refused again the second it is taken back.
                </p>
                <TryDoor
                  target={{
                    agentId: demoAgent.id,
                    agentName: demoAgent.name,
                    capability: DEMO.capability,
                    serverId: demoServer.id,
                    hostname: demoServer.hostname,
                    ownerEntityId: demoOwner.id,
                    ownerName: demoOwner.name,
                  }}
                />
                <Button variant="ghost" size="sm" className="w-fit text-text-2" nativeButton={false} render={<Link href="/drill" />}>
                  Run the whole story step by step <ArrowUpRight className="size-3.5" />
                </Button>
              </div>
            ) : (
              <p className="text-[13px] text-text-3">Loading…</p>
            )}
          </Panel>
        </BlurFade>

        <BlurFade delay={0.2} className="col-span-12 xl:col-span-7">
          <Panel
            eyebrow="The garrison"
            title="Six agents, no standing access"
            className="h-full"
            action={
              <Button variant="link" size="sm" className="text-text-2" nativeButton={false} render={<Link href="/agents" />}>
                All agents <ArrowUpRight className="size-3.5" />
              </Button>
            }
          >
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {agents.map((a) => {
                const n = activeByAgent(a.id);
                return (
                  <li key={a.id}>
                    <Link href={`/agents/${a.id}`} className="flex items-center gap-3 rounded-[12px] p-2 transition-colors hover:bg-bg-2">
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
                        <p className="truncate text-[12px] text-text-3">{n ? `${n} permission${n === 1 ? "" : "s"} on` : AGENT_STATUS_LABEL[a.status]}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.25} className="col-span-12 xl:col-span-5">
          <Panel
            eyebrow="Owners"
            title="Who owns what"
            className="h-full"
            action={
              <Button variant="link" size="sm" className="text-text-2" nativeButton={false} render={<Link href="/systems" />}>
                All systems <ArrowUpRight className="size-3.5" />
              </Button>
            }
          >
            <ul className="flex flex-col gap-2">
              {entities.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-[12px] bg-bg-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-1">{e.name}</p>
                    <p className="truncate text-[12px] text-text-3">{e.operatesAgents ? "Runs the six agents" : `${ownedBy(e.id)} systems · decides who may touch them`}</p>
                  </div>
                  <span className="mono-data text-[12px] text-text-2">{active.filter((l) => l.ownerEntityId === e.id).length} on</span>
                </li>
              ))}
            </ul>
          </Panel>
        </BlurFade>

        <BlurFade delay={0.3} className="col-span-12">
          <Panel
            eyebrow="The record"
            title="What happened"
            action={
              <Button variant="link" size="sm" className="text-text-2" nativeButton={false} render={<Link href="/record" />}>
                Everything <ArrowUpRight className="size-3.5" />
              </Button>
            }
          >
            <RecordList records={records} limit={8} dense />
          </Panel>
        </BlurFade>
      </div>

      {requester && (
        <AskDialog open={asking} onOpenChange={setAsking} dir={dir} requestingEntityId={requester.id} defaults={DEMO} />
      )}
    </div>
  );
}
