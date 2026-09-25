"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { Check, DownloadSimple, X } from "@phosphor-icons/react";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { KpiCard } from "@/components/compositions/kpi-card";
import { TraceView } from "@/components/compositions/trace-view";
import { BlurFade } from "@/components/ui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DotPattern } from "@/components/ui/dot-pattern";
import { TextEffect } from "@/components/ui/text-effect";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, useApprovals, useBootstrap, usePolicies, useTraces } from "@/lib/hooks/use-data";
import { VERDICT_CLASS, ago, clock, humanize } from "@/lib/format";
import type { Approval, Policy, PolicyEffect, ToolRisk, Trace } from "@/lib/types";
import { cn } from "@/lib/utils";

const EFFECT_CLASS: Record<PolicyEffect, string> = {
  allow: "text-lime",
  deny: "text-sev-critical",
  "require-approval": "text-sev-medium",
};
const RISK_CLASS: Record<ToolRisk, string> = { read: "sev-info", low: "sev-low", medium: "sev-medium", high: "sev-high", destructive: "sev-critical" };

function TracesTab({ initialTraceId }: { initialTraceId: string | null }) {
  const { data: boot } = useBootstrap();
  const [agent, setAgent] = React.useState<string>("all");
  const [verdict, setVerdict] = React.useState<string>("any");
  const query = `?limit=200${agent !== "all" ? `&agentId=${agent}` : ""}${verdict !== "any" ? `&verdict=${verdict}` : ""}`;
  const { data: traces } = useTraces(query);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialTraceId);
  const selected: Trace | undefined = traces?.find((t) => t.id === selectedId) ?? traces?.[0];
  const agentName = (id: string) => boot?.agents.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="bezel-core col-span-12 gap-0 border-0 p-0 xl:col-span-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <ToggleGroup
            value={[agent]}
            onValueChange={(v) => {
              const next = (v as string[])[0];
              if (next) setAgent(next);
            }}
            className="rounded-[10px] bg-bg-2 p-1"
          >
            <ToggleGroupItem value="all" className="h-7 rounded-[8px] px-2.5 text-[12px] text-text-2 data-[pressed]:bg-bg-3 data-[pressed]:text-lime">
              All
            </ToggleGroupItem>
            {boot?.agents.map((a) => (
              <ToggleGroupItem key={a.id} value={a.id} aria-label={a.name} className="h-7 w-8 rounded-[8px] px-0 data-[pressed]:bg-bg-3">
                <AgentAvatar agent={a} size={18} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select value={verdict} onValueChange={(v) => setVerdict((v as string) ?? "any")} items={{ any: "Any verdict", completed: "completed", "in-progress": "in progress", "awaiting-approval": "awaiting approval", denied: "denied", failed: "failed" }}>
            <SelectTrigger className="ml-auto h-8 w-[160px] border-line bg-bg-2 text-[12px]">
              <SelectValue placeholder="Any verdict" />
            </SelectTrigger>
            <SelectContent className="border-line bg-bg-3">
              <SelectItem value="any">Any verdict</SelectItem>
              {(["completed", "in-progress", "awaiting-approval", "denied", "failed"] as const).map((v) => (
                <SelectItem key={v} value={v}>
                  {humanize(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="h-[640px]">
          <ul className="flex flex-col gap-0.5 p-2">
            {traces?.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[12px] px-3 py-2 text-left transition-colors hover:bg-bg-2",
                    selected?.id === t.id && "bg-bg-2 ring-1 ring-line-strong",
                  )}
                >
                  <AgentAvatar agentId={t.agentId} size={24} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text-1">{t.intent}</span>
                    <span className="mono-data block text-[11px] text-text-3">
                      {t.id} · {t.spans.length} spans · {ago(t.startedAt)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className={cn("text-[11px]", VERDICT_CLASS[t.verdict])}>{humanize(t.verdict)}</span>
                    <Progress
                      value={t.riskScore}
                      className={cn("w-12", t.riskScore >= 70 ? "[&_[data-slot=progress-indicator]]:bg-sev-critical" : t.riskScore >= 40 ? "[&_[data-slot=progress-indicator]]:bg-sev-medium" : "[&_[data-slot=progress-indicator]]:bg-cerulean")}
                    />
                  </span>
                </button>
              </li>
            ))}
            {traces && traces.length === 0 && <li className="p-8 text-center text-text-3">No traces match.</li>}
          </ul>
        </ScrollArea>
      </Card>
      <Card className="bezel-core col-span-12 gap-0 border-0 p-4 xl:col-span-7">
        {selected ? (
          <ScrollArea className="h-[640px] pr-3">
            <TraceView trace={selected} agentName={agentName(selected.agentId)} />
          </ScrollArea>
        ) : (
          <div className="grid h-[640px] place-items-center text-text-3">Pick a trace to read it.</div>
        )}
      </Card>
    </div>
  );
}

function PolicyDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [effect, setEffect] = React.useState<PolicyEffect>("require-approval");
  const [risk, setRisk] = React.useState<ToolRisk | "any">("high");
  const [env, setEnv] = React.useState<string>("prod");
  const [priority, setPriority] = React.useState(50);

  const save = async () => {
    try {
      await api.governance.createPolicy({
        name,
        description,
        effect,
        enabled: true,
        priority,
        match: {
          ...(risk !== "any" ? { risk: [risk] } : {}),
          ...(env !== "any" ? { environments: [env as Policy["match"]["environments"] extends (infer E)[] | undefined ? E : never] } : {}),
        },
      });
      toast.success(`Policy "${name}" is live`);
      setOpen(false);
      setName("");
      setDescription("");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save policy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>New policy</DialogTrigger>
      <DialogContent className="bezel-core border-line">
        <DialogHeader>
          <DialogTitle className="font-display text-[24px] font-normal">New policy</DialogTitle>
          <DialogDescription>Policies are evaluated in priority order before any tool runs. Deny wins; then require-approval; then allow.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Rebuilding inference nodes needs a human" className="border-line bg-bg-2" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this exists" className="border-line bg-bg-2" />
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Effect
              <Select value={effect} onValueChange={(v) => setEffect((v as PolicyEffect) ?? "allow")} items={{ allow: "Allow", "require-approval": "Require approval", deny: "Deny" }}>
                <SelectTrigger className="border-line bg-bg-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-bg-3">
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="require-approval">Require approval</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Tool risk
              <Select value={risk} onValueChange={(v) => setRisk((v as ToolRisk | "any") ?? "any")}>
                <SelectTrigger className="border-line bg-bg-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-bg-3">
                  {(["any", "read", "low", "medium", "high", "destructive"] as const).map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Environment
              <Select value={env} onValueChange={(v) => setEnv((v as string) ?? "any")}>
                <SelectTrigger className="border-line bg-bg-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-bg-3">
                  {["any", "prod", "staging", "research", "sandbox"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <label className="flex items-center gap-3 text-[12px] text-text-2">
            Priority
            <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-24 border-line bg-bg-2" />
            <span className="text-text-3">lower runs first</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name}>
            Save policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PoliciesTab() {
  const { data: policies, mutate } = usePolicies();
  const toggle = async (p: Policy, enabled: boolean) => {
    try {
      await api.governance.updatePolicy(p.id, { enabled });
      toast.success(`${p.name} ${enabled ? "enabled" : "disabled"}`);
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update policy");
    }
  };
  const rows = [...(policies ?? [])].sort((a, b) => a.priority - b.priority);
  return (
    <Card className="bezel-core gap-0 border-0 p-0">
      <div className="flex items-center justify-between border-b border-line p-3">
        <p className="text-[12px] text-text-3">Evaluated top to bottom. Every evaluation — matched or not — is written into the trace.</p>
        <PolicyDialog onSaved={() => void mutate()} />
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-line hover:bg-transparent">
            <TableHead className="w-12 text-text-3">#</TableHead>
            <TableHead className="text-text-3">Policy</TableHead>
            <TableHead className="text-text-3">Effect</TableHead>
            <TableHead className="text-text-3">Matches</TableHead>
            <TableHead className="text-right text-text-3">Hits</TableHead>
            <TableHead className="w-16 text-right text-text-3">On</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id} className={cn("border-line", !p.enabled && "opacity-50")}>
              <TableCell className="mono-data text-text-3">{p.priority}</TableCell>
              <TableCell>
                <p className="text-text-1">{p.name}</p>
                <p className="text-[12px] text-text-3">{p.description}</p>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("mono-data border-line", EFFECT_CLASS[p.effect])}>
                  {p.effect}
                </Badge>
              </TableCell>
              <TableCell className="text-[11px] text-text-2">
                {[
                  p.match.tools?.length ? `tools: ${p.match.tools.join(", ")}` : null,
                  p.match.risk?.length ? `risk: ${p.match.risk.join("/")}` : null,
                  p.match.minSeverity ? `severity ≥ ${p.match.minSeverity}` : null,
                  p.match.environments?.length ? `env: ${p.match.environments.join("/")}` : null,
                  p.match.serverTags?.length ? `tags: ${p.match.serverTags.join(", ")}` : null,
                  p.match.agentRoles?.length ? `roles: ${p.match.agentRoles.join("/")}` : null,
                  p.match.timeWindow && p.match.timeWindow !== "any" ? `when: ${p.match.timeWindow}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "everything"}
              </TableCell>
              <TableCell className="mono-data text-right text-text-2">{p.hits}</TableCell>
              <TableCell className="text-right">
                <Switch checked={p.enabled} onCheckedChange={(v) => toggle(p, Boolean(v))} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function ApprovalsTab() {
  const { data: boot } = useBootstrap();
  const { data: approvals, mutate } = useApprovals();
  const agentName = (id: string) => boot?.agents.find((a) => a.id === id)?.name ?? id;
  const pending = (approvals ?? []).filter((a) => a.status === "pending");
  const decided = (approvals ?? []).filter((a) => a.status !== "pending").slice(0, 30);

  const [inflight, setInflight] = React.useState<Record<string, { decision: "approve" | "reject"; done: boolean }>>({});

  const decide = async (a: Approval, decision: "approve" | "reject") => {
    setInflight((m) => ({ ...m, [a.id]: { decision, done: false } }));
    try {
      await api.governance.decide(a.id, decision);
      setInflight((m) => ({ ...m, [a.id]: { decision, done: true } }));
      toast.success(decision === "approve" ? `Approved ${a.id}` : `Rejected ${a.id}`);
      await new Promise((r) => setTimeout(r, 900));
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision didn't go through");
    } finally {
      setInflight((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== a.id)));
    }
  };

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 xl:col-span-7">
        <p className="eyebrow mb-2">Waiting ({pending.length})</p>
        {pending.length === 0 ? (
          <Card className="bezel-core relative gap-0 overflow-hidden border-0 p-8 text-center">
            <DotPattern glow width={18} height={18} cr={0.8} className="[mask-image:radial-gradient(60%_80%_at_50%_50%,white,transparent)] text-lime/40" />
            <p className="relative font-display text-[22px] text-text-1">No approvals waiting.</p>
            <p className="relative mt-1 text-text-2">The gang is riding autonomously. You&apos;ll be asked for prod rebuilds and database moves.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
            {pending.map((a) => (
              <motion.li key={a.id} layout exit={{ opacity: 0, x: 24, height: 0, marginBottom: -12 }} transition={{ duration: 0.3, ease: [0.3, 0.7, 0.4, 1] }}>
                <Card className="bezel-core gap-0 border-0 p-4">
                  <div className="flex items-start gap-3">
                    <AgentAvatar agentId={a.agentId} status="awaiting-approval" size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text-1">{agentName(a.agentId)}</span>
                        <Badge variant="outline" className={cn("mono-data border-line", RISK_CLASS[a.risk])}>
                          {a.risk}
                        </Badge>
                        <span className="mono-data ml-auto text-[11px] text-text-3">
                          {a.id} · {ago(a.requestedAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-text-1">{a.summary}</p>
                      <p className="mono-data mt-1 text-[11px] text-text-3">
                        {a.toolName} → {a.targets.join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex min-h-8 items-center gap-2">
                    {inflight[a.id]?.done ? (
                      <TextEffect
                        per="char"
                        preset="scale"
                        speedReveal={2}
                        className={cn("flex items-center gap-1.5 text-[13px] font-medium", inflight[a.id].decision === "approve" ? "text-lime" : "text-sev-critical")}
                      >
                        {inflight[a.id].decision === "approve" ? "✓ Approved — the gang rides on" : "✕ Rejected — action withheld"}
                      </TextEffect>
                    ) : (
                      <>
                        <Button size="sm" loading={inflight[a.id]?.decision === "approve"} disabled={!!inflight[a.id]} onClick={() => decide(a, "approve")}>
                          {inflight[a.id]?.decision !== "approve" && <Check weight="bold" />} Approve
                        </Button>
                        <Button size="sm" variant="secondary" loading={inflight[a.id]?.decision === "reject"} disabled={!!inflight[a.id]} onClick={() => decide(a, "reject")}>
                          {inflight[a.id]?.decision !== "reject" && <X weight="bold" />} Reject
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              </motion.li>
            ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      <div className="col-span-12 xl:col-span-5">
        <p className="eyebrow mb-2">Decided</p>
        <Card className="bezel-core gap-0 border-0 p-0">
          <ul className="flex flex-col divide-y divide-line">
            {decided.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <AgentAvatar agentId={a.agentId} size={20} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-text-2">{a.summary}</span>
                <span className={cn("text-[11px]", a.status === "approved" ? "text-lime" : a.status === "rejected" ? "text-sev-critical" : "text-text-3")}>
                  {a.status}
                  {a.decidedBy ? ` · ${a.decidedBy}` : ""}
                </span>
                <span className="mono-data text-[11px] text-text-3">{a.decidedAt ? clock(a.decidedAt) : ""}</span>
              </li>
            ))}
            {decided.length === 0 && <li className="p-6 text-center text-text-3">Nothing decided yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function GovernanceInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") ?? "traces";
  const traceId = params.get("trace");
  const { data: boot } = useBootstrap();
  const { data: traces } = useTraces("?limit=200");
  const denials = traces?.filter((t) => t.verdict === "denied").length ?? 0;
  const pending = boot?.approvals.filter((a) => a.status === "pending").length ?? 0;
  const llmSpans = traces?.reduce((n, t) => n + t.spans.filter((s) => s.llm && !s.llm.fallback).length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Traces · policies · approvals"
        title="Governance"
        description="Every agent decision is a trace: what it saw, what it reasoned, which policies fired, what it did, and how it turned out."
        actions={
          <Button variant="secondary" size="sm" nativeButton={false} render={<a href={api.governance.exportUrl} download />} className="gap-1.5">
            <DownloadSimple weight="bold" className="size-3.5" /> Export audit
          </Button>
        }
      />
      <BlurFade delay={0.05} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Traces" value={traces?.length ?? 0} tone="cerulean" hint="last 200 shown" />
        <KpiCard label="Policies" value={boot?.policies.length ?? 0} tone="neutral" hint={`${boot?.policies.filter((p) => p.enabled).length ?? 0} enabled`} />
        <KpiCard label="Policy denials" value={denials} tone="warm" />
        <KpiCard label="Awaiting approval" value={pending} tone="lime" hint={`${llmSpans} LLM-narrated spans`} />
      </BlurFade>
      <Tabs value={tab} onValueChange={(v) => router.replace(`/governance?tab=${v}`)} className="gap-3">
        <TabsList className="w-fit bg-bg-2">
          <TabsTrigger value="traces">Traces</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="approvals">Approvals{pending ? ` (${pending})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="traces">
          <TracesTab initialTraceId={traceId} />
        </TabsContent>
        <TabsContent value="policies">
          <PoliciesTab />
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function GovernancePage() {
  return (
    <React.Suspense fallback={<div className="text-text-3">Loading governance…</div>}>
      <GovernanceInner />
    </React.Suspense>
  );
}
