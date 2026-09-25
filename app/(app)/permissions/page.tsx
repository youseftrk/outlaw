"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";

import { ActingAs } from "@/components/authority/acting-as";
import { AskDialog } from "@/components/authority/ask-dialog";
import { AuthorityPath } from "@/components/authority/authority-path";
import { HouseRulesCard } from "@/components/authority/house-rules-card";
import { PermissionCard, type Directory } from "@/components/authority/permission-card";
import { RecordList } from "@/components/authority/record-list";
import { LoadingState } from "@/components/beautiful-ui/loading-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActingAs, useAuthorityPath, useEntities, useHouseRules, useLeases, useRecords } from "@/lib/hooks/use-authority";
import { useBootstrap } from "@/lib/hooks/use-data";
import type { AuthorityLease } from "@/lib/types";

type Filter = "waiting" | "on" | "closed" | "all";
const FILTER_OF: Record<Filter, (l: AuthorityLease) => boolean> = {
  waiting: (l) => l.status === "pending" || l.status === "pending-step-up",
  on: (l) => l.status === "active",
  closed: (l) => l.status === "revoked" || l.status === "expired" || l.status === "declined",
  all: () => true,
};

function LeaseDetail({ lease, dir }: { lease: AuthorityLease; dir: Directory }) {
  const { data: path } = useAuthorityPath(lease.id);
  const { data: records = [] } = useRecords(`?leaseId=${lease.id}&limit=40`);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="eyebrow mb-2">How it travelled</p>
        {path ? <AuthorityPath path={path} /> : <p className="text-[13px] text-text-3">Loading…</p>}
      </div>
      <div>
        <p className="eyebrow mb-2">What happened to this permission</p>
        <RecordList records={records} dense />
      </div>
      <Collapsible className="lg:col-span-2">
        <CollapsibleTrigger className="text-[12px] text-text-3 underline-offset-2 hover:underline">For engineers</CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mono-data mt-2 overflow-x-auto rounded-lg bg-bg-2 p-3 text-[11.5px] text-text-2">
            {`# the same switch, from the command line\n` +
              `curl -X POST http://localhost:3000/api/protected/${lease.ownerEntityId}/${lease.capability} \\\n` +
              `  -H 'content-type: application/json' \\\n` +
              `  -d '{"actorId":"${lease.agentId ?? dir.agents[0]?.id ?? "agt-hisn"}"${lease.scope.serverIds?.[0] ? `,"serverId":"${lease.scope.serverIds[0]}"` : ""}}'\n\n` +
              `# 200 {"allowed":true,"leaseId":"${lease.id}",…}  or  403 {"error":"AUTHORITY_REVOKED",…}`}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function PermissionsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const filter = (params.get("status") as Filter | null) ?? "all";
  const selected = params.get("id");

  const { data: boot } = useBootstrap();
  const { data: entities = [] } = useEntities();
  const { data: leases = [] } = useLeases();
  const { data: rules = [] } = useHouseRules();
  const [actingAs] = useActingAs();
  const [asking, setAsking] = React.useState(false);

  const dir: Directory = React.useMemo(
    () => ({ entities, agents: boot?.agents ?? [], servers: boot?.servers ?? [] }),
    [entities, boot],
  );

  const rows = leases.filter(FILTER_OF[filter]).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const counts = { waiting: leases.filter(FILTER_OF.waiting).length, on: leases.filter(FILTER_OF.on).length, closed: leases.filter(FILTER_OF.closed).length };
  const requester = entities.find((e) => e.operatesAgents) ?? entities[0];
  const me = entities.find((e) => e.id === actingAs);
  const myRules = rules.find((r) => r.entityId === actingAs);

  const setFilter = (f: string) => router.replace(f === "all" ? "/permissions" : `/permissions?status=${f}`);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Who may do what, where, for how long"
        title="Permissions"
        description="A permission is one agent, one thing it may do, one place, one length of time, said yes to by the owner. Owners switch it off here."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActingAs />
            <Button onClick={() => setAsking(true)} className="gap-1.5" disabled={!requester}>
              <Plus weight="bold" className="size-3.5" /> Ask for permission
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 flex flex-col gap-3 xl:col-span-8">
          <Tabs value={filter} onValueChange={setFilter} className="gap-3">
            <TabsList>
              <TabsTrigger value="all">All ({leases.length})</TabsTrigger>
              <TabsTrigger value="waiting">Waiting ({counts.waiting})</TabsTrigger>
              <TabsTrigger value="on">On ({counts.on})</TabsTrigger>
              <TabsTrigger value="closed">Closed ({counts.closed})</TabsTrigger>
            </TabsList>
          </Tabs>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-8 text-center text-[13px] text-text-3">
              {filter === "waiting" ? "Nobody is waiting on an owner." : filter === "on" ? "No permission is on. Agents can only look." : "Nothing here yet."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {rows.map((l) => (
                  <motion.li key={l.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <PermissionCard lease={l} dir={dir} actingAs={actingAs} />
                    <button
                      type="button"
                      onClick={() => router.replace(selected === l.id ? `/permissions${filter === "all" ? "" : `?status=${filter}`}` : `/permissions?${filter === "all" ? "" : `status=${filter}&`}id=${l.id}`)}
                      className="mt-1 px-1 text-[12px] text-text-3 underline-offset-2 hover:text-text-2 hover:underline"
                      aria-expanded={selected === l.id}
                    >
                      {selected === l.id ? "Hide the story" : "See the whole story"}
                    </button>
                    <AnimatePresence initial={false}>
                      {selected === l.id && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="bezel-core mt-2 p-4">
                            <LeaseDetail lease={l} dir={dir} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <aside className="col-span-12 flex flex-col gap-3 xl:col-span-4">
          {me && myRules && !me.operatesAgents ? (
            <HouseRulesCard rules={myRules} entity={me} editable />
          ) : (
            rules
              .filter((r) => !entities.find((e) => e.id === r.entityId)?.operatesAgents)
              .map((r) => {
                const e = entities.find((x) => x.id === r.entityId);
                return e ? <HouseRulesCard key={r.entityId} rules={r} entity={e} editable={false} /> : null;
              })
          )}
          {me?.operatesAgents && (
            <p className="rounded-lg border border-line bg-bg-1 p-3 text-[12.5px] text-text-3">
              You run the agents, so you can ask — but only the owner of a system can say yes, say no, or take a permission back. Their house rules are shown above.
            </p>
          )}
        </aside>
      </div>

      {requester && <AskDialog open={asking} onOpenChange={setAsking} dir={dir} requestingEntityId={requester.id} />}
    </div>
  );
}

export default function PermissionsPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading permissions" variant="orbit" />}>
      <PermissionsInner />
    </React.Suspense>
  );
}
