"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp } from "@phosphor-icons/react";
import { ThinkingOrb } from "thinking-orbs";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { PromptInput, PromptInputActions, PromptInputTextarea } from "@/components/ui/prompt-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PromptSuggestion } from "@/components/ui/prompt-suggestion";
import { Markdown } from "@/components/ui/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BlurFade } from "@/components/ui/blur-fade";
import { api, useResearchQueries } from "@/lib/hooks/use-data";
import { useLiveEvent } from "@/lib/hooks/use-live";
import { SEVERITY_CLASS, SEVERITY_HEX, ago, humanize } from "@/lib/format";
import type { AttackTechnique, CVE, ResearchQuery, ThreatActor } from "@/lib/types";
import { cn } from "@/lib/utils";
import useSWR from "swr";
import { LoadingState } from "@/components/beautiful-ui/loading-state";
import { TextLoader } from "@/components/opensource-ui/text-loader";

const SUGGESTIONS = [
  "Enrich 185.220.101.4",
  "What is the blast radius if a dataset worker's env leaks?",
  "Map lateral movement techniques we've seen this week",
  "CVE exposure on pkg-cache-01",
  "Who is the autonomous eval-harness swarm?",
  "T1552.001 — where are we exposed?",
];

function KbBrowser() {
  const [type, setType] = React.useState<"cve" | "technique" | "actor">("cve");
  const [q, setQ] = React.useState("");
  const { data } = useSWR(`/research/kb?type=${type}&q=${encodeURIComponent(q)}`, () => api.research.kb(type, q), { keepPreviousData: true });
  return (
    <Card className="bezel-core gap-0 border-0 p-0">
      <Tabs value={type} onValueChange={(v) => setType(v as typeof type)} className="gap-0">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <TabsList className="bg-bg-2">
            <TabsTrigger value="cve">CVEs</TabsTrigger>
            <TabsTrigger value="technique">ATT&CK</TabsTrigger>
            <TabsTrigger value="actor">Actors</TabsTrigger>
          </TabsList>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the knowledge base" className="ml-auto h-8 w-[240px] border-line bg-bg-2 text-[12px]" />
        </div>
        <ScrollArea className="h-[300px]">
          <TabsContent value="cve" className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-line hover:bg-transparent">
                  <TableHead className="text-text-3">CVE</TableHead>
                  <TableHead className="text-text-3">Title</TableHead>
                  <TableHead className="text-text-3">CVSS</TableHead>
                  <TableHead className="text-text-3">Patched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {type === "cve" && (data as CVE[] | undefined)?.map((c) => (
                  <TableRow key={c.id} className="border-line">
                    <TableCell className="mono-data text-text-1">{c.id}</TableCell>
                    <TableCell className="text-text-2">{c.title}</TableCell>
                    <TableCell className={cn("mono-data", SEVERITY_CLASS[c.severity])}>{c.cvss.toFixed(1)}</TableCell>
                    <TableCell className={c.patched ? "text-lime" : "text-sev-high"}>{c.patched ? "yes" : "no"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="technique" className="p-2">
            <ul className="flex flex-col gap-1">
              {type === "technique" && (data as AttackTechnique[] | undefined)?.map((t) => (
                <li key={t.id} className="flex items-start gap-3 rounded-[10px] px-2 py-1.5 hover:bg-bg-2">
                  <a href={t.url} target="_blank" rel="noreferrer" className="mono-data shrink-0 text-cerulean hover:underline">
                    {t.id}
                  </a>
                  <div className="min-w-0">
                    <p className="text-text-1">
                      {t.name} <span className="text-[11px] text-text-3">· {humanize(t.tactic ?? "")}</span>
                    </p>
                    <p className="text-[12px] text-text-3">{t.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="actor" className="p-2">
            <ul className="flex flex-col gap-1">
              {type === "actor" && (data as ThreatActor[] | undefined)?.map((a) => (
                <li key={a.id} className="rounded-[10px] px-2 py-1.5 hover:bg-bg-2">
                  <p className="text-text-1">
                    {a.name} <span className="text-[11px] text-text-3">· {a.aliases.join(", ")}</span>
                  </p>
                  <p className="text-[12px] text-text-2">{a.description}</p>
                  <p className="mt-1 text-[11px] text-text-3">
                    {a.motivation} · {a.techniqueIds.join(" ")}
                  </p>
                </li>
              ))}
            </ul>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </Card>
  );
}

function Result({ q }: { q: ResearchQuery }) {
  const r = q.result;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <AgentAvatar agentId={q.agentId} status={q.status === "running" ? "investigating" : "observing"} size={36} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">
            {q.kind} · {ago(q.askedAt)}
            {q.traceId && (
              <>
                {" · "}
                <Link href={`/governance?tab=traces&trace=${q.traceId}`} className="mono-data normal-case tracking-normal text-cerulean hover:underline">
                  {q.traceId}
                </Link>
              </>
            )}
          </p>
          <p className="font-display mt-1 text-[22px] leading-tight text-text-1">{q.query}</p>
        </div>
      </div>
      {q.status === "running" && (
        <div className="flex items-center gap-3 rounded-[12px] bg-bg-2 p-3">
          <ThinkingOrb state="searching" size={20} theme="dark" />
          <span className="text-text-2">Doc is working the case — enriching indicators, pulling techniques, checking exposure.</span>
          <TextLoader text="Searching" className="ml-auto text-[13px]" />
        </div>
      )}
      {r && (
        <>
          <div className="prose-sm max-w-none text-text-1 [&_p]:my-1.5 [&_li]:text-text-2 [&_strong]:text-text-1">
            <Markdown>{r.summary}</Markdown>
          </div>
          {r.findings.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {r.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 rounded-[10px] bg-bg-0/50 px-3 py-2">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: f.severity ? SEVERITY_HEX[f.severity] : "var(--color-text-3)" }} />
                  <div>
                    <p className="text-text-1">{f.label}</p>
                    <p className="text-[12px] text-text-2">{f.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {r.cves.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">CVEs</p>
                <ul className="flex flex-col gap-1">
                  {r.cves.map((c) => (
                    <li key={c.id} className="rounded-[10px] bg-bg-0/50 px-3 py-2 text-[12px]">
                      <span className="mono-data text-text-1">{c.id}</span> <span className={cn("mono-data", SEVERITY_CLASS[c.severity])}>{c.cvss.toFixed(1)}</span>
                      <p className="text-text-2">{c.title}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.techniques.length > 0 && (
              <div>
                <p className="eyebrow mb-1.5">ATT&CK</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.techniques.map((t) => (
                    <Badge key={t.id} variant="outline" className="border-line text-text-2" render={<a href={t.url} target="_blank" rel="noreferrer" />}>
                      <span className="mono-data">{t.id}</span> {t.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          {r.iocs.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="border-line hover:bg-transparent">
                  <TableHead className="text-text-3">IOC</TableHead>
                  <TableHead className="text-text-3">Type</TableHead>
                  <TableHead className="text-text-3">Confidence</TableHead>
                  <TableHead className="text-text-3">Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.iocs.map((i) => (
                  <TableRow key={`${i.type}-${i.value}`} className="border-line">
                    <TableCell className="mono-data text-text-1">{i.value}</TableCell>
                    <TableCell className="text-text-2">{i.type}</TableCell>
                    <TableCell className="mono-data text-text-2">{Math.round(i.confidence * 100)}%</TableCell>
                    <TableCell className="text-[11px] text-text-3">{i.tags.join(", ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {r.relatedThreatIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow mr-1">related</span>
              {r.relatedThreatIds.map((id) => (
                <Badge key={id} variant="outline" className="mono-data border-line text-text-2" render={<Link href={`/threats/${id}`} />}>
                  {id}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResearchInner() {
  const params = useSearchParams();
  const { data: queries, mutate } = useResearchQueries();
  const [value, setValue] = React.useState(params.get("q") ?? "");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  useLiveEvent(["research.updated"], () => void mutate());

  const sorted = [...(queries ?? [])].sort((a, b) => b.askedAt.localeCompare(a.askedAt));
  const selected = sorted.find((q) => q.id === selectedId) ?? sorted[0];

  const ask = async (text?: string) => {
    const q = (text ?? value).trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const created = await api.research.ask(q);
      setSelectedId(created.id);
      setValue("");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Doc couldn't take that one");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Doc's workbench"
        title="Research"
        description="Ask Doc to enrich an indicator, explain a CVE, map techniques, or investigate anything in the fleet. Every investigation is a trace."
      />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-5">
          <BlurFade delay={0.05}>
            <Card className="bezel-core gap-0 border-0 p-3">
              <PromptInput value={value} onValueChange={setValue} onSubmit={() => void ask()} isLoading={busy} className="border-line bg-bg-2">
                <PromptInputTextarea placeholder="Ask Doc…" className="text-[13.5px]" />
                <PromptInputActions className="justify-end">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button size="icon-sm" onClick={() => void ask()} disabled={!value.trim() || busy} className="rounded-full bg-lime text-carbon hover:bg-lime/85" aria-label="Ask" />
                      }
                    >
                      <ArrowUp weight="bold" className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent>Send to Doc</TooltipContent>
                  </Tooltip>
                </PromptInputActions>
              </PromptInput>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <PromptSuggestion key={s} onClick={() => void ask(s)} className="h-7 rounded-full border-line bg-bg-2 text-[12px] text-text-2 hover:text-text-1">
                    {s}
                  </PromptSuggestion>
                ))}
              </div>
            </Card>
          </BlurFade>
          <BlurFade delay={0.1}>
            <Card className="bezel-core gap-0 border-0 p-0">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">Investigations ({sorted.length})</p>
              </div>
              <ScrollArea className="h-[260px]">
                <ul className="flex flex-col p-2">
                  {sorted.map((q) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(q.id)}
                        className={cn("flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left hover:bg-bg-2", selected?.id === q.id && "bg-bg-2 ring-1 ring-line-strong")}
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", q.status === "completed" ? "bg-lime" : q.status === "running" ? "bg-cerulean animate-pulse-soft" : "bg-sev-critical")} />
                        <span className="min-w-0 flex-1 truncate text-text-1">{q.query}</span>
                        <span className="mono-data text-[11px] text-text-3">{ago(q.askedAt)}</span>
                      </button>
                    </li>
                  ))}
                  {sorted.length === 0 && <li className="p-6 text-center text-text-3">Nothing asked yet.</li>}
                </ul>
              </ScrollArea>
            </Card>
          </BlurFade>
          <BlurFade delay={0.15}>
            <KbBrowser />
          </BlurFade>
        </div>
        <BlurFade delay={0.1} className="col-span-12 xl:col-span-7">
          <Card className="bezel-core min-h-[720px] gap-0 border-0 p-5">
            {selected ? (
              <Result q={selected} />
            ) : (
              <div className="grid h-[600px] place-items-center text-center">
                <div>
                  <p className="font-display text-[26px] text-text-1">Ask Doc something.</p>
                  <p className="mt-1 text-text-2">An IP, a CVE id, a technique, a hostname — or a plain question.</p>
                </div>
              </div>
            )}
          </Card>
        </BlurFade>
      </div>
    </div>
  );
}

export default function ResearchPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading research" variant="drive" />}>
      <ResearchInner />
    </React.Suspense>
  );
}
