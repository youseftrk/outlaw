"use client";

import * as React from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { GrainBackdrop } from "@/components/shell/grain-backdrop";
import { BlurFade } from "@/components/ui/blur-fade";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";
import market from "@/docs/research/market-demand.json";

/** Chart series keys → palette colors (lime for the headline market, greys/cerulean for the rest). */
const SERIES_KEYS = ["agentic", "trism", "nhi", "governance", "mea"] as const;
type SeriesKey = (typeof SERIES_KEYS)[number];

const SERIES_META: Record<SeriesKey, { label: string; color: string }> = {
  agentic: { label: "Agentic AI market, global", color: "var(--color-lime)" },
  trism: { label: "AI TRiSM (trust, risk & security)", color: "var(--color-cerulean)" },
  nhi: { label: "Non-human identity security", color: "#e6e6e0" },
  governance: { label: "AI governance", color: "#9db9c3" },
  mea: { label: "AI spend, Middle East & Africa", color: "var(--color-sev-medium)" },
};

const chartConfig: ChartConfig = Object.fromEntries(SERIES_KEYS.map((k) => [k, { label: SERIES_META[k].label, color: SERIES_META[k].color }]));

const YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031];

const chartRows = YEARS.map((year) => {
  const row: Record<string, number> = { year };
  market.series.forEach((s, i) => {
    const p = s.points.find((pt) => pt.year === year);
    if (p) row[SERIES_KEYS[i]] = p.value;
  });
  return row;
});

const HEADLINE_STATS: { value: number; prefix?: string; suffix?: string; label: string; note: string; source: string }[] = [
  {
    value: 50,
    suffix: "%",
    label: "of UAE government services on agentic AI within 2 years",
    note: "Announced Apr 2026",
    source: "https://mediaoffice.ae/en/news/2026/april/23-04/mohammed-bin-rashid-chairs-uae-cabinet-meeting",
  },
  {
    value: 13,
    prefix: "AED ",
    suffix: "B",
    label: "Abu Dhabi — world's first AI-native government by 2027",
    note: "DGE digital strategy",
    source: "https://www.dge.gov.ae/en/news/adg-digital-strategy",
  },
  {
    value: 230,
    suffix: "+",
    label: "Chief AI Officers appointed across Dubai government",
    note: "Apr 2025",
    source: "https://www.khaleejtimes.com/business/tech/dubai-ai-future-business-minister",
  },
];

const WHO_IT_SERVES: { entity: string; why: string }[] = [
  {
    entity: "NCEMA — emergency & crisis management",
    why: "Emergency workflows pull live data and act across police, health, transport and municipal entities in minutes — bounded, revocable permissions beat standing integrations.",
  },
  {
    entity: "Dubai Police",
    why: "Incident response touches RTA traffic systems, ambulances, municipality and utilities data; every cross-entity call needs explicit, logged authority.",
  },
  {
    entity: "DoH Abu Dhabi / DHA + NABIDH·Riayati",
    why: "Health agents serve citizens across insurers, hospitals and ICP identity records; consent-like permissions and an audit trail are mandated by PDPL.",
  },
  {
    entity: "TAMM / DGE (Abu Dhabi)",
    why: "AutoGov executes 1,100+ services spanning dozens of entities — the canonical platform where an agent needs another entity's capability.",
  },
  {
    entity: "Digital Dubai / DubaiNow",
    why: "The unified-platform mandate puts every Dubai service behind one door; agents on it will request cross-entity permissions at scale.",
  },
  {
    entity: "ICP — identity, citizenship & port security",
    why: "Owns the identity and visa capabilities every other entity's agents must call — the single largest grantor in the system.",
  },
  {
    entity: "RTA Dubai",
    why: "Transport agents coordinate with police, utilities (EV charging/grid), airports and event operations.",
  },
  {
    entity: "TDRA",
    why: "Runs federal digital-government rails (UAE PASS federation, .gov infrastructure) — natural host or first regulator-user of an authority layer.",
  },
];

function Stat({ value, prefix, suffix, label, note, source }: (typeof HEADLINE_STATS)[number]) {
  return (
    <Card className="bezel-core gap-0 border-0 p-4">
      <p className="mono-data text-[34px] leading-none text-lime">
        {prefix}
        <NumberTicker value={value} />
        {suffix}
      </p>
      <p className="mt-2 text-[13px] leading-snug text-text-1">{label}</p>
      <a href={source} target="_blank" rel="noreferrer" className="mono-data mt-1.5 inline-flex items-center gap-1 text-[10px] text-text-3 hover:text-text-1">
        {note} <ArrowSquareOut className="size-2.5" />
      </a>
    </Card>
  );
}

export default function WhyPage() {
  return (
    <div className="relative flex flex-col gap-4">
      <BlurFade>
        <Card className="bezel-core relative gap-0 overflow-hidden border-0 p-6 md:p-8">
          <GrainBackdrop position="absolute" />
          <div className="relative">
            <p className="eyebrow">Market demand · why now</p>
            <h1 className="font-display mt-2 max-w-[720px] text-[34px] leading-[1.05] text-text-1 md:text-[44px]">
              The UAE is wiring its government to run on AI agents.
            </h1>
            <p className="mt-3 max-w-[560px] text-[15px] leading-relaxed text-text-2">
              Every agent that touches another entity needs explicit, revocable authority — one switch, one record.
              That&apos;s the market Qalaa is built for.
            </p>
          </div>
        </Card>
      </BlurFade>

      <BlurFade delay={0.05} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {HEADLINE_STATS.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </BlurFade>

      <BlurFade delay={0.1}>
        <Card className="bezel-core gap-0 border-0 p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="eyebrow">Market demand</p>
              <h2 className="font-display mt-1 text-[20px] leading-tight text-text-1">The control layer for agents is growing 20–45% a year</h2>
            </div>
            <p className="mono-data text-[11px] text-text-3">USD billions · sourced estimates</p>
          </div>
          <ChartContainer config={chartConfig} className="h-[280px] w-full aspect-auto">
            <LineChart data={chartRows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="rgba(217, 217, 214,0.06)" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fill: "#75787b", fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#75787b", fontSize: 11 }} />
              <ChartTooltip cursor={{ stroke: "rgba(217, 217, 214,0.15)" }} content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {SERIES_KEYS.map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={SERIES_META[k].label}
                  stroke={`var(--color-${k})`}
                  strokeWidth={k === "agentic" ? 2 : 1.5}
                  connectNulls
                  dot={{ r: 2.5, fill: `var(--color-${k})`, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ChartContainer>
          <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
            {market.series.map((s, i) => (
              <li key={s.name} className="flex items-baseline gap-2 text-[11px] text-text-3">
                <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: SERIES_META[SERIES_KEYS[i]].color }} />
                <span className="min-w-0">
                  <span className="text-text-2">{SERIES_META[SERIES_KEYS[i]].label}</span> — {s.source_detail}{" "}
                  <a href={s.source} target="_blank" rel="noreferrer" className="text-cerulean hover:underline">
                    source <ArrowSquareOut className="inline size-2.5 -translate-y-px" />
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </BlurFade>

      <BlurFade delay={0.15} className="grid grid-cols-12 gap-4">
        <Card className="bezel-core col-span-12 gap-0 border-0 p-4 xl:col-span-5">
          <p className="eyebrow">UAE demand signals</p>
          <ul className="mt-3 flex flex-col gap-3">
            {market.callouts.map((c) => (
              <li key={c.label} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-lime" />
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-text-1">{c.label}</p>
                  <a href={c.source} target="_blank" rel="noreferrer" className="text-[11px] text-cerulean hover:underline">
                    source <ArrowSquareOut className="inline size-2.5 -translate-y-px" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="bezel-core col-span-12 gap-0 border-0 p-4 xl:col-span-7">
          <p className="eyebrow">Who it serves</p>
          <p className="mt-1 text-[13px] text-text-2">Likely first customers — entities whose agents cross entity boundaries.</p>
          <ul className="mt-3 flex flex-col gap-3">
            {WHO_IT_SERVES.map((w, i) => (
              <li key={w.entity} className={cn("flex gap-3", i !== 0 && "border-t border-line pt-3")}>
                <span className="mono-data mt-0.5 w-5 shrink-0 text-[10px] text-text-3">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text-1">{w.entity}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-text-2">{w.why}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mono-data mt-4 text-[10px] text-text-3">
            Figures from public sources — Statista/Capgemini, MarketsandMarkets, Mordor Intelligence, IDC, UAE government announcements · compiled {market.generated}
          </p>
        </Card>
      </BlurFade>
    </div>
  );
}
