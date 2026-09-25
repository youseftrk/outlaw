"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, PaperPlaneTilt } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { AuthorityPath } from "@/components/authority/authority-path";
import { DrillGuide } from "@/components/authority/drill-guide";
import { PermissionCard, type Directory } from "@/components/authority/permission-card";
import { RecordList } from "@/components/authority/record-list";
import { TryDoor } from "@/components/authority/try-door";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { authorityApi, useAuthorityPath, useDrillState, useEntities, useLease, useRecords, useRefreshAuthority } from "@/lib/hooks/use-authority";
import { useBootstrap } from "@/lib/hooks/use-data";
import { CAPABILITY_LABEL } from "@/lib/types";

const DEMO = { agentId: "agt-hisn", capability: "contain" as const, serverId: "srv-dataset-worker-02" };

const STAGE_COPY = {
  "no-permission": { who: "You are watching", say: "Hisn, one of the agents, wants to contain a system that belongs to another organisation. Nobody has said yes. Try the door." },
  asked: { who: "You are now the owner", say: "The request is on your desk. It says exactly what the agent may do, where, why and for how long. Say yes, or no." },
  "owner-accepted": { who: "You are now the owner", say: "One more thing for a high-risk action: a one-time code, sent to a person. Enter it to switch the permission on." },
  "code-needed": { who: "You are now the owner", say: "One more thing for a high-risk action: a one-time code, sent to a person. Enter it to switch the permission on." },
  allowed: { who: "You are watching", say: "The permission is on. Try the very same door again." },
  acted: { who: "You are now the owner", say: "It worked, and it is written down. Now take the permission back." },
  revoked: { who: "You are watching", say: "Taken back. Try the door one last time — the very next attempt is refused." },
  expired: { who: "You are watching", say: "The time ran out on its own. Try the door — it is refused." },
} as const;

export default function DrillPage() {
  const { data: boot } = useBootstrap();
  const { data: entities = [] } = useEntities();
  const { data: drill } = useDrillState();
  const { data: lease } = useLease(drill?.leaseId ?? null);
  const { data: path } = useAuthorityPath(drill?.leaseId ?? null);
  const { data: records = [] } = useRecords(drill?.leaseId ? `?leaseId=${drill.leaseId}&limit=40` : "?limit=12");
  const refresh = useRefreshAuthority();
  const [askBusy, setAskBusy] = React.useState(false);

  const dir: Directory = React.useMemo(
    () => ({ entities, agents: boot?.agents ?? [], servers: boot?.servers ?? [] }),
    [entities, boot],
  );
  const { servers, agents } = dir;

  const server = servers.find((s) => s.id === DEMO.serverId);
  const owner = entities.find((e) => e.id === server?.ownerEntityId);
  const agent = agents.find((a) => a.id === DEMO.agentId);
  const requester = entities.find((e) => e.id === agent?.entityId) ?? entities.find((e) => e.operatesAgents);

  const ask = async () => {
    if (!owner || !requester || !agent) return;
    setAskBusy(true);
    try {
      const s = await authorityApi.suggest({ agentId: agent.id, capability: DEMO.capability, serverId: DEMO.serverId });
      await authorityApi.request({
        requestingEntityId: requester.id,
        ownerEntityId: owner.id,
        agentId: agent.id,
        capability: s.capability,
        scope: s.scope,
        justification: s.justification,
        incidentId: s.incidentId,
        durationSec: s.durationSec,
      });
      toast.success(`Asked ${owner.shortName}. The request is on their desk.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not ask");
    } finally {
      setAskBusy(false);
    }
  };

  const step = drill?.step ?? "no-permission";
  const copy = STAGE_COPY[step];
  const showDoor = step === "no-permission" || step === "allowed" || step === "revoked" || step === "expired";
  const showCard = lease && (step === "asked" || step === "owner-accepted" || step === "code-needed" || step === "acted");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="The whole story in six steps"
        title="Run a drill"
        description="Refused, asked, allowed, done, taken back, refused again. Everything you see here is decided by the server, not by the screen."
        actions={
          <Button variant="ghost" size="sm" className="text-text-2" nativeButton={false} render={<Link href="/drill/replay" />}>
            Replay a real incident instead <ArrowUpRight className="size-3.5" />
          </Button>
        }
      />

      <DrillGuide />

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 xl:col-span-7">
          <div className="bezel-core flex min-h-[320px] flex-col gap-4 p-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                <p className="eyebrow mb-1.5">{copy.who}</p>
                <p className="font-display text-[22px] leading-snug text-text-1">{copy.say}</p>
              </motion.div>
            </AnimatePresence>

            {showDoor && server && owner && agent && (
              <TryDoor
                target={{
                  agentId: agent.id,
                  agentName: agent.name,
                  capability: DEMO.capability,
                  serverId: server.id,
                  hostname: server.hostname,
                  ownerEntityId: owner.id,
                  ownerName: owner.name,
                }}
              />
            )}

            {step === "no-permission" && owner && (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={ask} loading={askBusy} disabled={askBusy || !requester} className="gap-1.5">
                  <PaperPlaneTilt weight="fill" className="size-3.5" /> Ask {owner.shortName} for permission
                </Button>
                <span className="text-[12.5px] text-text-3">
                  Qalaa drafts the smallest request: {CAPABILITY_LABEL[DEMO.capability].toLowerCase()}, only {server?.hostname}, no longer than the owner allows.
                </span>
              </div>
            )}

            {showCard && lease && <PermissionCard lease={lease} dir={dir} actingAs={lease.ownerEntityId} />}

            {(step === "revoked" || step === "expired") && (
              <p className="text-[13px] text-text-2">That is the whole idea. Use &ldquo;Start over&rdquo; above to run it again.</p>
            )}
          </div>
        </section>

        <aside className="col-span-12 flex flex-col gap-4 xl:col-span-5">
          <div className="bezel-core p-4">
            <p className="eyebrow mb-2">How the permission travelled</p>
            {path ? <AuthorityPath path={path} /> : <p className="text-[13px] text-text-3">Appears once someone asks.</p>}
          </div>
          <div className="bezel-core p-4">
            <p className="eyebrow mb-2">What happened</p>
            <RecordList records={records} dense />
          </div>
        </aside>
      </div>
    </div>
  );
}
