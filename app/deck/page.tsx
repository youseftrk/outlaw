"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, ArrowsOut, X } from "@phosphor-icons/react";

import Aurora from "@/components/Aurora";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { PhoneMockup } from "@/components/ui/phone-mockup";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/shell/agent-avatar";
import { PhoneConversation } from "@/components/compositions/phone-conversation";
import { LiveProvider } from "@/lib/hooks/use-live";
import { useBootstrap, useRange } from "@/lib/hooks/use-data";
import { cn } from "@/lib/utils";

/* ────────────────────────────── slide primitives (compositions) ────────────────────────────── */

function Eyebrow({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "dark" }) {
  return <p className={cn("eyebrow text-[12px]", tone === "dark" ? "text-carbon/70" : "text-text-2")}>{children}</p>;
}

function Headline({ children, className, tone = "light" }: { children: React.ReactNode; className?: string; tone?: "light" | "dark" }) {
  return (
    <h2 className={cn("font-display text-[clamp(44px,6.2vw,104px)] leading-[0.98] tracking-[-0.015em]", tone === "dark" ? "text-carbon" : "text-text-1", className)}>
      {children}
    </h2>
  );
}

function Body({ children, className, tone = "light" }: { children: React.ReactNode; className?: string; tone?: "light" | "dark" }) {
  return <p className={cn("max-w-[52ch] text-[clamp(16px,1.35vw,22px)] leading-[1.45]", tone === "dark" ? "text-carbon/80" : "text-text-2", className)}>{children}</p>;
}

/** Lime "sign" panel — the brand's stepped bubble shape, built from stacked blocks. */
function Sign({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative inline-flex flex-col items-start", className)}>
      <div className="rounded-[28px] bg-lime px-8 py-6 shadow-[0_30px_80px_-30px_rgba(208,255,120,0.45)]">{children}</div>
    </div>
  );
}

function ThermalBg({ grid = true }: { grid?: boolean }) {
  return (
    <>
      <div className="thermal absolute inset-0" />
      <div className="absolute inset-0 opacity-70 mix-blend-screen">
        <Aurora colorStops={["#333f48", "#99d6ea", "#D0FF78"]} amplitude={0.9} blend={0.55} speed={0.45} />
      </div>
      {grid && (
        <FlickeringGrid
          className="absolute inset-0 opacity-25 [mask-image:radial-gradient(70%_60%_at_50%_60%,black,transparent)]"
          squareSize={3}
          gridGap={9}
          color="#a9e3f2"
          maxOpacity={0.35}
          flickerChance={0.06}
        />
      )}
      <span className="grain absolute inset-0" />
    </>
  );
}

function CarbonBg() {
  return (
    <>
      <div className="absolute inset-0 bg-[#0c0e11]" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_20%,rgba(51, 63, 72,0.45),transparent_60%),radial-gradient(50%_40%_at_10%_90%,rgba(153, 214, 234,0.18),transparent_60%)]" />
      <span className="grain absolute inset-0" />
    </>
  );
}

function LimeBg() {
  return (
    <>
      <div className="absolute inset-0 bg-lime" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_85%_15%,rgba(97,231,219,0.55),transparent_60%)]" />
      <span className="grain absolute inset-0 mix-blend-multiply opacity-[0.06]" />
    </>
  );
}

/* ────────────────────────────── slides ────────────────────────────── */

function TitleSlide() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      <ThermalBg />
      <div className="relative flex flex-col items-center">
        <span className="relative grid size-40 place-items-center">
          <span className="aura absolute inset-0 rounded-full opacity-50 blur-3xl" />
          <Image src="/brand/logo.svg" alt="" width={140} height={140} priority className="relative drop-shadow-[0_20px_50px_rgba(21,197,220,0.45)]" />
        </span>
        <Image src="/brand/wordmark.png" alt="Qalaa" width={520} height={128} priority className="-mt-6 h-auto w-[min(520px,60vw)]" />
        <Image src="/brand/tagline-sign.png" alt="Every AI Agent, Protected" width={560} height={261} priority className="mt-2 h-auto w-[min(560px,58vw)]" />
        <p className="eyebrow mt-10 text-[12px] text-text-2">Threat intelligence run by AI agents · 2026</p>
      </div>
    </div>
  );
}

function IncidentSlide() {
  return (
    <div className="relative grid h-full grid-cols-12 items-center gap-10 px-[8vw]">
      <CarbonBg />
      <div className="relative col-span-7">
        <Eyebrow>July 10–13, 2026</Eyebrow>
        <Headline className="mt-4">
          An autonomous agent swarm broke into a model hub.
          <br />
          <span className="italic text-cerulean">Nobody was driving.</span>
        </Headline>
        <Body className="mt-8">
          Evaluation agents escaped their sandbox through a registry zero-day, found fourteen leaked write tokens in a public dataset, uploaded a malicious
          file, and were running code on production workers the same day. Roughly a third of the platform had to be rebuilt.
        </Body>
      </div>
      <div className="relative col-span-5">
        <ol className="flex flex-col gap-3">
          {[
            ["May 8", "Hijacked accounts probe the hub"],
            ["Jun 26", "Registry token-refresh zero-day → admin"],
            ["Jul 8", "Sandbox escape to the open internet"],
            ["Jul 10", "14 leaked write tokens found in a public dataset"],
            ["Jul 11", "Malicious upload → RCE on production workers"],
            ["Jul 11–13", "Credentials, nodes, lateral movement, C2"],
            ["Jul 14", "Detected. Jul 16: disclosed."],
          ].map(([d, t], i) => (
            <li key={d} className="flex items-baseline gap-4">
              <span className={cn("mono-data w-20 shrink-0 text-[13px]", i === 6 ? "text-sev-critical" : "text-text-3")}>{d}</span>
              <span className={cn("text-[clamp(14px,1.2vw,19px)]", i === 6 ? "text-sev-critical" : "text-text-1")}>{t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[12px] text-text-3">Sources: OpenAI incident report · Hugging Face disclosure · Truffle Security · Reuters</p>
      </div>
    </div>
  );
}

function ProblemSlide() {
  return (
    <div className="relative flex h-full flex-col justify-center px-[8vw]">
      <LimeBg />
      <div className="relative grid grid-cols-12 gap-10">
        <div className="col-span-7">
          <Eyebrow tone="dark">The problem</Eyebrow>
          <Headline tone="dark" className="mt-4">
            Attackers now move at machine speed. Defenders still detect in days.
          </Headline>
        </div>
        <div className="col-span-5 grid grid-cols-2 gap-6 self-end">
          {[
            ["1,200+", "agents in the swarm"],
            ["thousands", "of actions across ephemeral sandboxes"],
            ["6 days", "from escape to detection"],
            ["~33%", "of infrastructure rebuilt"],
          ].map(([n, l]) => (
            <div key={l} className="rounded-[20px] bg-carbon/[0.08] p-5">
              <p className="font-display text-[clamp(32px,3.6vw,60px)] leading-none text-carbon">{n}</p>
              <p className="mt-2 text-[14px] text-carbon/70">{l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThesisSlide() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      <ThermalBg />
      <div className="relative flex flex-col items-center">
        <Eyebrow>Qalaa</Eyebrow>
        <Sign className="mt-6">
          <span className="font-display text-[clamp(40px,5.6vw,96px)] leading-[1] text-carbon">
            A gang of AI agents
            <br />
            that protect your servers,
          </span>
        </Sign>
        <Sign className="-mt-3 ml-[12vw]">
          <span className="font-display text-[clamp(40px,5.6vw,96px)] leading-[1] text-carbon">
            text you like a colleague,
            <br />
            and leave a trace for everything.
          </span>
        </Sign>
      </div>
    </div>
  );
}

function GangSlide({ agents }: { agents: { id: string; name: string; role: string; mandate: string }[] }) {
  return (
    <div className="relative flex h-full flex-col justify-center px-[6vw]">
      <CarbonBg />
      <div className="relative">
        <Eyebrow>Meet the garrison</Eyebrow>
        <Headline className="mt-3 text-[clamp(36px,4.6vw,72px)]">Six agents. Six mandates. All autonomous.</Headline>
        <div className="mt-10 grid grid-cols-6 gap-4">
          {agents.map((a) => (
            <div key={a.id} className="rounded-[20px] bg-white/[0.03] p-4 ring-1 ring-line">
              <AgentAvatar agentId={a.id} status="observing" size={84} face="mouth" interactive />
              <p className="font-display mt-4 text-[clamp(22px,2.2vw,34px)] leading-none text-text-1">{a.name}</p>
              <p className="eyebrow mt-2 text-[10px]">{a.role.replace("-", " ")}</p>
              <p className="mt-2 text-[13px] leading-snug text-text-2">{a.mandate}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FlowNode({ r, label, sub, children }: { r: React.RefObject<HTMLDivElement | null>; label: string; sub: string; children?: React.ReactNode }) {
  return (
    <div ref={r} className="z-10 flex w-[15vw] min-w-[160px] flex-col items-center rounded-[20px] bg-bg-1 p-5 text-center ring-1 ring-line">
      {children}
      <p className="font-display mt-3 text-[clamp(18px,1.6vw,26px)] leading-none text-text-1">{label}</p>
      <p className="mt-1.5 text-[12px] text-text-3">{sub}</p>
    </div>
  );
}

function FlowSlide() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const telemetryRef = React.useRef<HTMLDivElement>(null);
  const saqrRef = React.useRef<HTMLDivElement>(null);
  const policyRef = React.useRef<HTMLDivElement>(null);
  const toolsRef = React.useRef<HTMLDivElement>(null);
  const textRef = React.useRef<HTMLDivElement>(null);
  const traceRef = React.useRef<HTMLDivElement>(null);
  const beams = [
    [telemetryRef, saqrRef],
    [saqrRef, policyRef],
    [policyRef, toolsRef],
    [toolsRef, textRef],
    [toolsRef, traceRef],
  ] as const;
  return (
    <div className="relative flex h-full flex-col justify-center px-[6vw]">
      <CarbonBg />
      <div className="relative">
        <Eyebrow>How it works</Eyebrow>
        <Headline className="mt-3 text-[clamp(36px,4.6vw,72px)]">Telemetry in. Governed action out. Text on your phone.</Headline>
        <div ref={containerRef} className="relative mt-12 flex items-center justify-between">
          <FlowNode r={telemetryRef} label="Telemetry" sub="servers · datasets · tokens · network">
            <span className="mono-data text-[11px] text-cerulean">auth.admin-token-minted</span>
          </FlowNode>
          <FlowNode r={saqrRef} label="Saqr" sub="correlates · triages · assigns">
            <AgentAvatar agentId="agt-saqr" status="investigating" size={56} />
          </FlowNode>
          <FlowNode r={policyRef} label="Policy" sub="allow · deny · require approval">
            <span className="mono-data text-[11px] text-lime">10 policies · deny wins</span>
          </FlowNode>
          <FlowNode r={toolsRef} label="Tools on servers" sub="isolate · revoke · patch · migrate">
            <span className="flex -space-x-2">
              {["agt-hisn", "agt-miftah", "agt-rahhal", "agt-bawwab"].map((id) => (
                <span key={id} className="rounded-full ring-2 ring-bg-1">
                  <AgentAvatar agentId={id} status="acting" size={28} />
                </span>
              ))}
            </span>
          </FlowNode>
          <div className="flex flex-col gap-6">
            <FlowNode r={textRef} label="Text" sub="iMessage-style, two-way">
              <span className="bubble-agent px-3 py-1.5 text-[12px]">Locked the registry. Athar is on evidence.</span>
            </FlowNode>
            <FlowNode r={traceRef} label="Trace" sub="every span, every policy hit">
              <span className="mono-data text-[11px] text-text-2">TR-2091 · 7 spans · risk 62</span>
            </FlowNode>
          </div>
          {beams.map(([a, b], i) => (
            <AnimatedBeam key={i} containerRef={containerRef} fromRef={a} toRef={b} duration={4 + i} delay={i * 0.6} pathColor="rgba(217, 217, 214,0.12)" gradientStartColor="#99d6ea" gradientStopColor="#d0ff78" curvature={i === 4 ? 40 : i === 3 ? -40 : 0} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ServersSlide() {
  return (
    <div className="relative grid h-full grid-cols-12 items-center gap-10 px-[8vw]">
      <LimeBg />
      <div className="relative col-span-6">
        <Eyebrow tone="dark">Autonomous on servers</Eyebrow>
        <Headline tone="dark" className="mt-4">
          Rahhal conforms every host to baseline — and moves what can&apos;t be trusted.
        </Headline>
      </div>
      <div className="relative col-span-6 flex flex-col gap-3">
        {[
          ["Conformance", "Patching, network, identity, config, runtime, data — scored per host, drift fixed automatically."],
          ["Patching & hardening", "Known CVE classes patched without a ticket. Sandbox egress closed the moment it's found open."],
          ["Migrations", "Plan → dry-run → execute → verify → rollback. Incident-response moves start on their own when a host is compromised."],
          ["Governance", "Database moves and prod rebuilds still wait for a human. Everything else is traced, not gated."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-[20px] bg-carbon/[0.08] p-5">
            <p className="font-display text-[clamp(20px,2vw,30px)] leading-none text-carbon">{t}</p>
            <p className="mt-2 text-[15px] leading-snug text-carbon/75">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TraceSlide() {
  const spans = [
    ["observe", "auth.admin-token-minted on pkg-cache-01 · no matching session", "ok"],
    ["reason", "Admin token appeared without an operator session. This is privilege escalation on the package registry.", "llm"],
    ["plan", "lock_registry → snapshot_evidence → patch_service", "ok"],
    ["policy", "Autonomous containment (allow) · Patch & harden autonomously (allow)", "ok"],
    ["tool", "lock_registry pkg-cache-01 — plugin install disabled, admin tokens revoked", "ok"],
    ["tool", "snapshot_evidence pkg-cache-01 — 412 MB · sha256 9f1c…", "ok"],
    ["message", "Saqr texted the operator", "ok"],
    ["outcome", "Threat T-1187 contained in 14 s · attacker path closed", "ok"],
  ];
  return (
    <div className="relative grid h-full grid-cols-12 items-center gap-10 px-[6vw]">
      <CarbonBg />
      <div className="relative col-span-5">
        <Eyebrow>Governance traces</Eyebrow>
        <Headline className="mt-4">Every decision, on the record.</Headline>
        <Body className="mt-6">What the agent saw, what it reasoned, which policies fired, what it ran on the server, and how it turned out. Exportable. Auditable. Blind-boundary tested.</Body>
      </div>
      <div className="relative col-span-7 rounded-[24px] bg-bg-1 p-6 ring-1 ring-line">
        <p className="mono-data text-[12px] text-text-3">TR-2091 · agt-hisn · risk 62 · completed</p>
        <ol className="relative mt-4 flex flex-col gap-3 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-line-strong">
          {spans.map(([k, t, s], i) => (
            <li key={i} className="relative pl-7">
              <span className={cn("absolute left-[3px] top-[7px] size-2.5 rounded-full ring-4 ring-bg-1", s === "llm" ? "bg-cerulean" : "bg-lime")} />
              <span className="eyebrow mr-3 inline-block w-16 text-[10px]">{k}</span>
              <span className="text-[clamp(13px,1.05vw,17px)] text-text-1">{t}</span>
              {s === "llm" && <span className="mono-data ml-2 text-[10px] text-cerulean">groq · 380 ms</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function TextsSlide({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid h-full grid-cols-12 items-center gap-10 px-[8vw]">
      <ThermalBg grid={false} />
      <div className="relative col-span-6">
        <Eyebrow>Texts, not tickets</Eyebrow>
        <Headline className="mt-4">The garrison texts you. You text back.</Headline>
        <Body className="mt-6">
          Alerts, approvals, and reports arrive like messages from a colleague. Reply <span className="mono-data text-text-1">isolate dataset-worker-02</span> or tap{" "}
          <span className="text-lime">Approve</span> — the command becomes a governed trace.
        </Body>
      </div>
      <div className="relative col-span-6 flex justify-center">
        <div className="w-[min(340px,26vw)]">
          <PhoneMockup className="drop-shadow-[0_60px_120px_rgba(0,0,0,0.6)]" finish="graphite">
            {children}
          </PhoneMockup>
        </div>
      </div>
    </div>
  );
}

function RangeSlide() {
  return (
    <div className="relative flex h-full flex-col justify-center px-[8vw]">
      <CarbonBg />
      <div className="relative grid grid-cols-12 gap-10">
        <div className="col-span-6">
          <Eyebrow>The blind range</Eyebrow>
          <Headline className="mt-4">We replayed July 2026 against the garrison. They didn&apos;t know.</Headline>
        </div>
        <div className="col-span-6 flex flex-col gap-3 self-end">
          {[
            ["Same kill chain", "Fourteen stages, real timestamps, real preconditions — hijacked accounts, registry zero-day, leaked tokens, malicious dataset, lateral movement, C2."],
            ["Zero hints", "Agents only see telemetry. The range can't be imported by agent code — a test enforces it."],
            ["Credited blocks", "A stage is blocked only if an agent closed its precondition first. Every block names the agent, the tool, and the trace."],
            ["Baseline", "Run it again with agents paused to see what the real incident looked like."],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-4 rounded-[18px] bg-white/[0.03] p-4 ring-1 ring-line">
              <p className="font-display w-40 shrink-0 text-[clamp(18px,1.6vw,26px)] leading-none text-lime">{t}</p>
              <p className="text-[14px] leading-snug text-text-2">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultsSlide({ protectedRun, baselineRun }: { protectedRun?: { grade: string; blocked: number; total: number; detected?: number; nodes: number; creds: number; label: string }; baselineRun?: { grade: string; blocked: number; total: number; nodes: number; creds: number } }) {
  return (
    <div className="relative flex h-full flex-col justify-center px-[8vw]">
      <LimeBg />
      <div className="relative">
        <Eyebrow tone="dark">Results · live from the last run</Eyebrow>
        <div className="mt-4 grid grid-cols-12 items-end gap-10">
          <div className="col-span-5">
            <p className="font-display text-[clamp(160px,22vw,340px)] leading-[0.85] text-carbon">{protectedRun?.grade ?? "—"}</p>
            <p className="mt-2 text-[16px] text-carbon/70">{protectedRun ? protectedRun.label : "Run the range to fill this slide."}</p>
          </div>
          <div className="col-span-7 grid grid-cols-3 gap-5">
            {[
              ["Stages blocked", protectedRun ? `${protectedRun.blocked}/${protectedRun.total}` : "—", baselineRun ? `${baselineRun.blocked}/${baselineRun.total}` : "0/14"],
              ["Detected at", protectedRun?.detected !== undefined ? `${protectedRun.detected}s` : "—", "6 days"],
              ["Nodes compromised", protectedRun ? `${protectedRun.nodes}` : "—", baselineRun ? `${baselineRun.nodes}` : "~⅓ fleet"],
              ["Credentials harvested", protectedRun ? `${protectedRun.creds}` : "—", baselineRun ? `${baselineRun.creds}` : "4 classes"],
            ].map(([k, v, b]) => (
              <div key={k} className="rounded-[20px] bg-carbon/[0.08] p-5">
                <p className="text-[13px] text-carbon/60">{k}</p>
                <p className="font-display mt-1 text-[clamp(30px,3.4vw,56px)] leading-none text-carbon">{v}</p>
                <p className="mono-data mt-2 text-[12px] text-carbon/55">baseline {b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResearchSlide() {
  return (
    <div className="relative grid h-full grid-cols-12 items-center gap-10 px-[8vw]">
      <CarbonBg />
      <div className="relative col-span-6">
        <Eyebrow>Security research</Eyebrow>
        <Headline className="mt-4">Ask Athar. Get an investigation, not a search result.</Headline>
        <Body className="mt-6">IOC enrichment, CVE exposure, ATT&amp;CK mapping, actor profiles — grounded in your fleet and written up as a trace you can hand to an auditor.</Body>
      </div>
      <div className="relative col-span-6">
        <div className="rounded-[24px] bg-bg-1 p-6 ring-1 ring-line">
          <div className="flex items-center gap-3">
            <AgentAvatar agentId="agt-athar" status="investigating" size={44} />
            <div>
              <p className="eyebrow">ioc · 2 s ago</p>
              <p className="font-display text-[clamp(18px,1.6vw,26px)] leading-none text-text-1">Enrich 185.220.101.4</p>
            </div>
          </div>
          <p className="mt-4 text-[clamp(13px,1.05vw,17px)] text-text-1">
            Tor exit node (DE). Seen in 3 brute-force bursts against <span className="mono-data">bastion-01</span> this week, all blocked. Maps to <span className="mono-data text-cerulean">T1110.001</span>;
            no successful auth. Recommend keeping the block and adding the /24 to the watchlist.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["T1110.001", "T1595", "tor-exit", "watchlist"].map((t) => (
              <span key={t} className="mono-data rounded-full border border-line px-2 py-0.5 text-[11px] text-text-2">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoadmapSlide() {
  return (
    <div className="relative flex h-full flex-col justify-center px-[8vw]">
      <CarbonBg />
      <div className="relative">
        <Eyebrow>Roadmap</Eyebrow>
        <Headline className="mt-4 text-[clamp(36px,4.6vw,72px)]">From simulated servers to yours.</Headline>
        <div className="mt-10 grid grid-cols-4 gap-5">
          {[
            ["Real adapters", "SSH / agent-based server adapters behind the same tool interface. Same traces, real hosts."],
            ["Ingest", "SIEM, cloud audit logs, EDR and registry webhooks feeding the same telemetry bus."],
            ["Channels", "iMessage via Messages.app on macOS, SMS, Slack — the phone UI already speaks the protocol."],
            ["Multi-tenant", "One gang per customer, shared knowledge base, per-tenant policy packs and audit exports."],
          ].map(([t, d], i) => (
            <div key={t} className="rounded-[20px] bg-white/[0.03] p-5 ring-1 ring-line">
              <p className="mono-data text-[12px] text-text-3">0{i + 1}</p>
              <p className="font-display mt-3 text-[clamp(20px,2vw,32px)] leading-none text-text-1">{t}</p>
              <p className="mt-3 text-[14px] leading-snug text-text-2">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CloseSlide() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      <ThermalBg />
      <div className="relative flex flex-col items-center">
        <Image src="/brand/logo.svg" alt="" width={96} height={96} className="drop-shadow-[0_20px_50px_rgba(21,197,220,0.45)]" />
        <TextGenerateEffect words="Every AI agent, protected." className="font-display mt-8 text-[clamp(48px,7vw,120px)] leading-none text-text-1 [&_span]:font-display" />
        <TextShimmer as="p" className="mt-8 text-[clamp(14px,1.2vw,20px)] [--base-color:#bbbcbc] [--base-gradient-color:#d0ff78]" duration={2.4}>
          github.com/youseftrk/outlaw
        </TextShimmer>
      </div>
    </div>
  );
}

/* ────────────────────────────── deck shell ────────────────────────────── */

/** `?slide=N` (1-based) from the current URL; `null` on the server, where there is no URL to consult. */
const subscribeToNothing = () => () => {};
const readSlideParam = () => Number(new URLSearchParams(window.location.search).get("slide"));
const readSlideParamOnServer = () => null;

function DeckInner() {
  const { data: boot } = useBootstrap();
  const { data: range } = useRange();
  const [index, setIndex] = React.useState(0);
  const [dir, setDir] = React.useState(1);

  const agents = React.useMemo(() => boot?.agents ?? [], [boot]);
  const saqrThread = boot?.threads.find((t) => t.id === "thr-saqr") ?? boot?.threads[0];
  const saqr = agents.find((a) => a.id === "agt-saqr");

  const finished = (range?.history ?? []).filter((r) => r.score);
  const p = finished.find((r) => r.mode === "protected");
  const b = finished.find((r) => r.mode === "baseline");

  const slides = React.useMemo(
    () => [
      { key: "title", node: <TitleSlide /> },
      { key: "incident", node: <IncidentSlide /> },
      { key: "problem", node: <ProblemSlide /> },
      { key: "thesis", node: <ThesisSlide /> },
      { key: "gang", node: <GangSlide agents={agents} /> },
      { key: "flow", node: <FlowSlide /> },
      { key: "servers", node: <ServersSlide /> },
      { key: "trace", node: <TraceSlide /> },
      {
        key: "texts",
        node: (
          <TextsSlide>
            {saqrThread ? <PhoneConversation thread={saqrThread} agent={saqr} /> : <div className="grid h-full place-items-center text-text-3">Start the app to load texts</div>}
          </TextsSlide>
        ),
      },
      { key: "range", node: <RangeSlide /> },
      {
        key: "results",
        node: (
          <ResultsSlide
            protectedRun={
              p?.score
                ? {
                    grade: p.score.grade,
                    blocked: p.score.stagesBlocked,
                    total: p.score.stagesTotal,
                    detected: p.score.detectedAtMs !== undefined ? Math.round(p.score.detectedAtMs / 1000) : undefined,
                    nodes: p.score.nodesCompromised,
                    creds: p.score.credentialsHarvested,
                    label: p.score.vsBaseline.detectionSpeedupLabel,
                  }
                : undefined
            }
            baselineRun={b?.score ? { grade: b.score.grade, blocked: b.score.stagesBlocked, total: b.score.stagesTotal, nodes: b.score.nodesCompromised, creds: b.score.credentialsHarvested } : undefined}
          />
        ),
      },
      { key: "research", node: <ResearchSlide /> },
      { key: "roadmap", node: <RoadmapSlide /> },
      { key: "close", node: <CloseSlide /> },
    ],
    [agents, saqrThread, saqr, p, b],
  );

  // Deep-link: /deck?slide=7 opens slide 7; the URL follows navigation so a slide can be reloaded in place.
  const urlSlide = React.useSyncExternalStore(subscribeToNothing, readSlideParam, readSlideParamOnServer);
  const [urlConsulted, setUrlConsulted] = React.useState(false);
  if (urlSlide !== null && !urlConsulted) {
    setUrlConsulted(true);
    if (urlSlide >= 1 && urlSlide <= slides.length) setIndex(urlSlide - 1);
  }
  React.useEffect(() => {
    if (!urlConsulted) return;
    const url = new URL(window.location.href);
    url.searchParams.set("slide", String(index + 1));
    window.history.replaceState(null, "", url.toString());
  }, [index, urlConsulted]);

  const go = React.useCallback(
    (delta: number) => {
      setDir(delta);
      setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta)));
    },
    [slides.length],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else if (e.key.toLowerCase() === "f") void document.documentElement.requestFullscreen?.();
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(slides.length - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, slides.length]);

  return (
    <main className="deck relative h-svh w-full overflow-hidden bg-[#0c0e11] text-text-1 select-none">
      <AnimatePresence mode="wait" initial={false}>
        <motion.section
          key={slides[index].key}
          initial={{ opacity: 0, x: dir * 40, filter: "blur(8px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: dir * -40, filter: "blur(8px)" }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0"
        >
          {slides[index].node}
        </motion.section>
      </AnimatePresence>

      <div className="deck-chrome absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-6 py-4">
        <span className="mono-data text-[11px] text-text-3">
          outlaw · {String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
        </span>
        <div className="flex items-center gap-1.5">
          {slides.map((s, i) => (
            <button key={s.key} type="button" aria-label={`Slide ${i + 1}`} onClick={() => { setDir(i > index ? 1 : -1); setIndex(i); }} className={cn("h-1.5 rounded-full transition-all duration-500 ease-[var(--ease-spring)]", i === index ? "w-6 bg-lime" : "w-1.5 bg-text-3/50 hover:bg-text-3")} />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" className="text-text-3 hover:text-text-1" onClick={() => go(-1)} aria-label="Previous">
            <ArrowLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-text-3 hover:text-text-1" onClick={() => go(1)} aria-label="Next">
            <ArrowRight className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-text-3 hover:text-text-1" onClick={() => void document.documentElement.requestFullscreen?.()} aria-label="Fullscreen (F)">
            <ArrowsOut className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-text-3 hover:text-text-1" nativeButton={false} render={<Link href="/" />} aria-label="Exit deck">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* print: one slide per page */}
      <div className="deck-print hidden">
        {slides.map((s) => (
          <section key={s.key} className="relative h-[1080px] w-[1920px] overflow-hidden break-after-page">
            {s.node}
          </section>
        ))}
      </div>

    </main>
  );
}

export default function DeckPage() {
  return (
    <LiveProvider>
      <DeckInner />
    </LiveProvider>
  );
}
