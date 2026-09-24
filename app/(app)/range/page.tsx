"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowSquareOut, EyeSlash, Pause, Play, Stop } from "@phosphor-icons/react";
import NumberFlow from "@number-flow/react";

import { PageHeader } from "@/components/shell/page-header";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { LiveFeed } from "@/components/compositions/live-feed";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnimatedSpan, Terminal } from "@/components/ui/terminal";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, useBootstrap, useRange } from "@/lib/hooks/use-data";
import { clock, humanize } from "@/lib/format";
import type { RangeMode, RangeRun, RangeScenario, RangeStep, RangeStepResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const GRADE_CLASS: Record<string, string> = { S: "text-lime", A: "text-lime", B: "text-cerulean", C: "text-sev-medium", D: "text-sev-high", F: "text-sev-critical" };

function StepChip({ step, result, active }: { step: RangeStep; result?: RangeStepResult; active: boolean }) {
  const status = result?.status ?? "pending";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "relative flex min-w-0 flex-1 flex-col gap-1.5 rounded-[12px] border px-2.5 py-2 text-left transition-colors",
              status === "pending" && "border-line bg-bg-1 text-text-3",
              status === "active" && "border-cerulean/50 bg-cerulean/10 text-text-1",
              status === "succeeded" && "border-sev-critical/40 bg-sev-critical/10 text-text-1",
              status === "blocked" && "border-lime/50 bg-lime/10 text-text-1",
              status === "skipped" && "border-line bg-bg-1 text-text-3 opacity-60",
            )}
          />
        }
      >
        {active && <BorderBeam size={60} duration={4} colorFrom="#24c7d6" colorTo="#d0ff78" borderWidth={1.5} />}
        <span className="mono-data text-[10px] opacity-70">
          {String(step.order).padStart(2, "0")} · {step.realWorldLabel}
        </span>
        <span className="truncate text-[12px] leading-tight">{step.title}</span>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              status === "pending" && "bg-bg-3",
              status === "active" && "bg-cerulean animate-pulse-soft",
              status === "succeeded" && "bg-sev-critical",
              status === "blocked" && "bg-lime",
              status === "skipped" && "bg-bg-3",
            )}
          />
          <span className="text-[10px] uppercase tracking-wider opacity-80">{status === "succeeded" ? "got through" : status}</span>
          {result?.blockedBy && (
            <span className="ml-auto">
              <AgentAvatar agentId={result.blockedBy.agentId} size={16} />
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[320px] border-line bg-bg-3 p-3 text-text-1">
        <p className="eyebrow mb-1">{humanize(step.stage)}</p>
        <p className="font-medium">{step.title}</p>
        <p className="mt-1 text-[12px] text-text-2">{step.description}</p>
        {result?.blockedBy && (
          <p className="mt-2 text-[12px] text-lime">
            Blocked by {result.blockedBy.toolName} — {result.blockedBy.note}
          </p>
        )}
        <p className="mono-data mt-2 text-[10px] text-text-3">{step.techniqueIds.join(" · ")}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ScoreCard({ run, scenario }: { run: RangeRun; scenario: RangeScenario }) {
  const s = run.score;
  if (!s) return null;
  return (
    <Card className="bezel-core relative gap-0 overflow-hidden border-0 p-5">
      <div className="thermal pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-3">
          <p className="eyebrow">Grade · {run.mode}</p>
          <p className={cn("font-display mt-1 text-[112px] leading-none", GRADE_CLASS[s.grade])}>{s.grade}</p>
        </div>
        <div className="col-span-12 grid grid-cols-2 gap-4 md:col-span-9 md:grid-cols-4">
          {[
            ["Stages blocked", `${s.stagesBlocked} / ${s.stagesTotal}`],
            ["Detected at", s.detectedAtMs !== undefined ? `${Math.round(s.detectedAtMs / 1000)}s` : "never"],
            ["Contained at", s.containedAtMs !== undefined ? `${Math.round(s.containedAtMs / 1000)}s` : "—"],
            ["Nodes compromised", `${s.nodesCompromised}`],
            ["Credentials harvested", `${s.credentialsHarvested}`],
            ["Datasets accessed", `${s.datasetsAccessed}`],
            ["Servers isolated", `${s.serversIsolated}`],
            ["False positives", `${s.falsePositives}`],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[12px] text-text-3">{k}</p>
              <p className="mono-data text-[22px] leading-none text-text-1">{v}</p>
            </div>
          ))}
          <div className="col-span-2 rounded-[12px] bg-bg-0/50 p-3 md:col-span-4">
            <p className="eyebrow mb-1">vs. what really happened</p>
            <p className="text-text-1">{s.vsBaseline.detectionSpeedupLabel}</p>
            <p className="mt-1 text-text-2">
              Blast radius reduced by <span className="mono-data text-lime">{s.vsBaseline.blastRadiusReductionPct}%</span> — the real incident rebuilt about {scenario.baseline.infraRebuiltPct}% of the
              platform, detected after {scenario.baseline.detectedAfterLabel}, disclosed {scenario.baseline.disclosedAfterLabel}.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function RangePage() {
  const { data, mutate } = useRange();
  const { data: boot } = useBootstrap();
  const [mode, setMode] = React.useState<RangeMode>("protected");
  const [speed, setSpeed] = React.useState(2);
  const [starting, setStarting] = React.useState(false);

  const scenario = data?.scenarios[0];
  const run = data?.activeRun ?? null;
  const history = data?.history ?? [];
  const lastFinished = history.find((r) => r.status === "completed" || r.status === "aborted");
  const shown = run ?? lastFinished ?? null;

  const start = async () => {
    if (!scenario) return;
    setStarting(true);
    try {
      await api.range.start(scenario.id, mode, speed);
      toast.success(mode === "protected" ? "Replay started. The gang has no idea." : "Baseline run started — agents paused.");
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the run");
    } finally {
      setStarting(false);
    }
  };

  const control = async (action: "pause" | "resume" | "abort") => {
    if (!run) return;
    try {
      await api.range.action(run.id, action);
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the run");
    }
  };

  const changeSpeed = async (v: number) => {
    setSpeed(v);
    if (run && run.status === "running") {
      try {
        await api.range.speed(run.id, v);
      } catch {
        /* ignore */
      }
    }
  };

  const blocked = shown?.stepResults.filter((r) => r.status === "blocked").length ?? 0;
  const through = shown?.stepResults.filter((r) => r.status === "succeeded").length ?? 0;
  const elapsed = shown ? Math.round(shown.clockMs / 1000) : 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Blind cyber range · agents don't know it's a drill"
        title={scenario?.name ?? "July 2026 replay"}
        description={scenario?.description}
        actions={
          run && run.status !== "completed" && run.status !== "aborted" ? (
            <>
              {run.status === "running" ? (
                <Button variant="secondary" onClick={() => control("pause")} className="gap-1.5">
                  <Pause weight="fill" className="size-3.5" /> Pause
                </Button>
              ) : (
                <Button onClick={() => control("resume")} className="gap-1.5">
                  <Play weight="fill" className="size-3.5" /> Resume
                </Button>
              )}
              <Button variant="destructive" onClick={() => control("abort")} className="gap-1.5">
                <Stop weight="fill" className="size-3.5" /> Abort
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <BlurFade delay={0.05} className="col-span-12 xl:col-span-8">
          <Card className="bezel-core relative gap-0 overflow-hidden border-0 p-5">
            {run?.status === "running" && <BorderBeam size={160} duration={10} colorFrom="#ff5d6c" colorTo="#d0ff78" borderWidth={1.5} />}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Based on</p>
                <p className="mt-1 text-text-1">{scenario?.basedOn}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {scenario?.sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-text-2 hover:text-text-1">
                      {s.label} <ArrowSquareOut className="size-3" />
                    </a>
                  ))}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-4 text-right">
                <div>
                  <dt className="text-[11px] text-text-3">Real detection</dt>
                  <dd className="mono-data text-text-1">{scenario?.baseline.detectedAfterLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-text-3">Real disclosure</dt>
                  <dd className="mono-data text-text-1">{scenario?.baseline.disclosedAfterLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-text-3">Infra rebuilt</dt>
                  <dd className="mono-data text-text-1">{scenario?.baseline.infraRebuiltPct}%</dd>
                </div>
              </dl>
            </div>

            {!run && (
              <div className="mt-5 flex flex-wrap items-end gap-4 rounded-[14px] bg-bg-0/50 p-4">
                <div>
                  <p className="eyebrow mb-2">Mode</p>
                  <ToggleGroup
                    value={[mode]}
                    onValueChange={(v) => {
                      const next = (v as RangeMode[])[0];
                      if (next) setMode(next);
                    }}
                    className="rounded-[10px] bg-bg-2 p-1"
                  >
                    <ToggleGroupItem value="protected" className="h-8 rounded-[8px] px-3 text-[12px] text-text-2 data-[pressed]:bg-bg-3 data-[pressed]:text-lime">
                      Protected · gang on duty
                    </ToggleGroupItem>
                    <ToggleGroupItem value="baseline" className="h-8 rounded-[8px] px-3 text-[12px] text-text-2 data-[pressed]:bg-bg-3 data-[pressed]:text-sev-high">
                      Baseline · no agents
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="min-w-[220px] flex-1">
                  <p className="eyebrow mb-2">
                    Speed · <span className="mono-data normal-case tracking-normal text-text-1">{speed}×</span>
                    <span className="normal-case tracking-normal"> · ≈{Math.round((scenario?.durationMs ?? 360000) / 1000 / speed / 60)} min</span>
                  </p>
                  <Slider value={[speed]} min={1} max={8} step={1} onValueChange={(v) => changeSpeed(Array.isArray(v) ? v[0] : v)} />
                </div>
                <Button size="lg" onClick={start} disabled={starting || !scenario} className="gap-2">
                  <Play weight="fill" className="size-4" /> Start the replay
                </Button>
              </div>
            )}

            {shown && (
              <div className="mt-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="mono-data border-line uppercase">
                    {shown.mode}
                  </Badge>
                  <Badge variant="outline" className={cn("border-line", shown.status === "running" ? "text-cerulean" : shown.status === "completed" ? "text-lime" : "text-text-2")}>
                    {shown.status}
                  </Badge>
                  <span className="mono-data text-[12px] text-text-3">
                    clock <NumberFlow value={elapsed} />s · {shown.speed}×
                  </span>
                  <span className="ml-auto text-[12px] text-text-2">
                    <span className="text-lime">{blocked} blocked</span> · <span className="text-sev-critical">{through} got through</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 xl:grid-cols-7">
                  {scenario?.steps.map((step, i) => (
                    <StepChip key={step.id} step={step} result={shown.stepResults.find((r) => r.stepId === step.id)} active={shown.status === "running" && shown.currentStepIndex === i} />
                  ))}
                </div>
              </div>
            )}
          </Card>
        </BlurFade>

        <BlurFade delay={0.1} className="col-span-12 xl:col-span-4">
          <Card className="bezel-core h-full gap-0 border-0 p-4">
            <p className="eyebrow">How the range works</p>
            <ol className="mt-3 flex flex-col gap-3 text-text-2">
              <li className="flex gap-3">
                <span className="mono-data text-text-3">1</span>
                <span>The range mutates the simulated environment exactly the way the real attacker did — hijacked accounts, a registry zero-day, leaked tokens, a malicious dataset.</span>
              </li>
              <li className="flex gap-3">
                <span className="mono-data text-text-3">2</span>
                <span>
                  The gang only sees telemetry. No scenario names, no script, no hints. <span className="text-text-1">The import boundary is enforced in code and tests.</span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mono-data text-text-3">3</span>
                <span>Each attack stage needs preconditions in the world. If an agent closed one — revoked the token, locked the registry, blocked egress — the stage is blocked and credited.</span>
              </li>
              <li className="flex gap-3">
                <span className="mono-data text-text-3">4</span>
                <span>Baseline mode runs the same chain with agents paused, so you can compare against what actually happened.</span>
              </li>
            </ol>
            <div className="mt-4 flex items-center gap-2 rounded-[12px] bg-bg-0/50 p-3 text-[12px] text-text-3">
              <EyeSlash weight="light" className="size-4 shrink-0" />
              The attacker view below is operator-only. Agents can&apos;t read it.
            </div>
          </Card>
        </BlurFade>

        {shown?.score && (
          <BlurFade delay={0.1} className="col-span-12">
            {scenario && <ScoreCard run={shown} scenario={scenario} />}
          </BlurFade>
        )}

        <BlurFade delay={0.15} className="col-span-12 xl:col-span-6">
          <Card className="bezel-core gap-0 border-0 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Attacker view · operator-only</p>
              <span className="text-[11px] text-sev-high">agents can&apos;t see this</span>
            </div>
            <Terminal className="max-h-[420px] min-h-[320px] w-full max-w-none border-line bg-bg-0" startOnView={false}>
              {(shown?.attackerLog ?? []).length === 0 && <AnimatedSpan className="text-text-3">$ waiting for a run…</AnimatedSpan>}
              {(shown?.attackerLog ?? []).slice(-60).map((l, i) => (
                <AnimatedSpan key={`${l.at}-${i}`} className="text-[12px]">
                  <span className="text-text-3">{clock(l.at)}</span> <span className="text-sev-high">{l.text}</span>
                </AnimatedSpan>
              ))}
            </Terminal>
          </Card>
        </BlurFade>

        <BlurFade delay={0.2} className="col-span-12 xl:col-span-6">
          <Card className="bezel-core h-full gap-0 border-0 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Gang response · live</p>
              <Link href="/messages" className="text-[11px] text-cerulean hover:underline">
                Read the texts
              </Link>
            </div>
            <LiveFeed limit={16} types={["threat.detected", "threat.updated", "agent.action", "approval.requested", "trace.completed", "message.sent"]} />
          </Card>
        </BlurFade>

        {history.length > 0 && (
          <BlurFade delay={0.25} className="col-span-12">
            <Card className="bezel-core gap-0 border-0 p-0">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">Run history · protected vs baseline</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-line hover:bg-transparent">
                    <TableHead className="text-text-3">Run</TableHead>
                    <TableHead className="text-text-3">Mode</TableHead>
                    <TableHead className="text-text-3">Grade</TableHead>
                    <TableHead className="text-text-3">Blocked</TableHead>
                    <TableHead className="text-text-3">Detected</TableHead>
                    <TableHead className="text-text-3">Nodes</TableHead>
                    <TableHead className="text-text-3">Creds</TableHead>
                    <TableHead className="text-text-3">Datasets</TableHead>
                    <TableHead className="text-right text-text-3">Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.slice(0, 12).map((r) => (
                    <TableRow key={r.id} className="border-line">
                      <TableCell className="mono-data text-text-2">{r.id}</TableCell>
                      <TableCell className={r.mode === "protected" ? "text-lime" : "text-sev-high"}>{r.mode}</TableCell>
                      <TableCell className={cn("font-display text-[20px]", r.score ? GRADE_CLASS[r.score.grade] : "text-text-3")}>{r.score?.grade ?? "—"}</TableCell>
                      <TableCell className="mono-data text-text-1">
                        {r.score ? `${r.score.stagesBlocked}/${r.score.stagesTotal}` : "—"}
                      </TableCell>
                      <TableCell className="mono-data text-text-2">{r.score?.detectedAtMs !== undefined ? `${Math.round(r.score.detectedAtMs / 1000)}s` : "—"}</TableCell>
                      <TableCell className="mono-data text-text-2">{r.score?.nodesCompromised ?? "—"}</TableCell>
                      <TableCell className="mono-data text-text-2">{r.score?.credentialsHarvested ?? "—"}</TableCell>
                      <TableCell className="mono-data text-text-2">{r.score?.datasetsAccessed ?? "—"}</TableCell>
                      <TableCell className="mono-data text-right text-[11px] text-text-3">{clock(r.startedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </BlurFade>
        )}
      </div>
      <span className="hidden">{boot?.serverTime}</span>
    </div>
  );
}
