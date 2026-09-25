"use client";

import * as React from "react";
import NumberFlow from "@number-flow/react";
import { Area, AreaChart } from "recharts";
import { Card } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const sparkConfig: ChartConfig = { v: { label: "value", color: "var(--color-cerulean)" } };

/** KPI tile: eyebrow label, NumberFlow value, optional delta + sparkline. shadcn Card + chart; hover lifts and rings lime. */
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
      style={{ "--kpi-glow": color } as React.CSSProperties}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/kpi:opacity-100"
        style={{ boxShadow: "inset 0 0 0 1px var(--kpi-glow)" }}
      />
      <p className="eyebrow">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="mono-data text-[30px] leading-none text-text-1">
          <NumberFlow value={value} format={format} willChange />
          {suffix && <span className="ml-1 text-[16px] text-text-3">{suffix}</span>}
        </div>
        {data.length > 1 && (
          <ChartContainer config={sparkConfig} className="h-10 w-24 shrink-0 aspect-auto">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={color}
                fillOpacity={0.12}
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
