"use client";

import * as React from "react";
import NumberFlow from "@number-flow/react";
import { Area, AreaChart } from "recharts";
import { Card } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { cn } from "@/lib/utils";

const sparkConfig: ChartConfig = { v: { label: "value", color: "var(--color-cerulean)" } };

/** KPI tile: eyebrow label, NumberFlow value, optional delta + sparkline. shadcn Card + chart + Aceternity GlowingEffect on hover. */
export function KpiCard({
  label,
  value,
  suffix,
  format,
  hint,
  spark,
  tone = "neutral",
  className,
}: {
  label: string;
  value: number;
  suffix?: string;
  format?: React.ComponentProps<typeof NumberFlow>["format"];
  hint?: React.ReactNode;
  spark?: number[];
  tone?: "neutral" | "lime" | "cerulean" | "warm";
  className?: string;
}) {
  const color =
    tone === "lime"
      ? "var(--color-lime)"
      : tone === "warm"
        ? "var(--color-sev-high)"
        : tone === "cerulean"
          ? "var(--color-cerulean)"
          : "var(--color-text-2)";
  const data = (spark ?? []).map((v, i) => ({ i, v }));
  return (
    <Card
      className={cn(
        "bezel-core group/kpi relative gap-0 overflow-hidden border-0 p-4 transition-[translate,box-shadow] duration-300 ease-[var(--ease-spring)] motion-safe:hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-18px_var(--kpi-glow)]",
        className,
      )}
      style={{ "--black": color, "--kpi-glow": color } as React.CSSProperties}
    >
      <GlowingEffect variant="white" spread={36} proximity={48} inactiveZone={0.2} borderWidth={1} disabled={false} className="opacity-70" />
      <p className="eyebrow">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="mono-data text-[30px] leading-none text-text-1">
          <NumberFlow value={value} format={format} willChange />
          {suffix && <span className="ml-1 text-[16px] text-text-3">{suffix}</span>}
        </div>
        {data.length > 1 && (
          <ChartContainer config={sparkConfig} className="h-10 w-24 shrink-0 aspect-auto">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#spark-${label})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
      {hint && <p className="mt-2 text-[12px] text-text-3">{hint}</p>}
    </Card>
  );
}
