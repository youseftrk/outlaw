"use client";

/**
 * Beautiful UI `LoadingState` (https://beautifului.dev, MIT © 2026 Shane Levine).
 * Pixel-grid loader with a shimmering label and a live elapsed timer.
 * Adapted for Qalaa: Pantone-neutral tokens, `variant` typed, Surfer (remote video) variant dropped.
 * Keyframes `pixel-on` / `shimmer-text` live in app/globals.css.
 */

import { useEffect, useState } from "react";
import { cn } from "cn";

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3),
    c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

export type LoadingVariant = "drive" | "dots" | "orbit";

const PATTERNS: Record<LoadingVariant, { delays: (number | null)[]; dur: number; round: boolean }> = {
  drive: { delays: chevron, dur: 650, round: false },
  dots: { delays: chevron, dur: 650, round: true },
  orbit: { delays: orbit, dur: 950, round: false },
};

export function LoaderGrid({ variant = "drive", className }: { variant?: LoadingVariant; className?: string }) {
  const { delays, dur, round } = PATTERNS[variant];
  return (
    <span aria-hidden className={cn("grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]", className)}>
      {delays.map((delay, index) => (
        <span
          key={index}
          className={cn("size-[4px] bg-current", round ? "rounded-full" : "rounded-[1px]")}
          style={{
            opacity: delay === null ? 0.07 : 0.15,
            animation: delay === null ? "none" : `pixel-on ${dur}ms ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

function useElapsed() {
  const [ds, setDs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDs((d) => d + 1), 100);
    return () => clearInterval(t);
  }, []);
  const total = ds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

export function LoadingState({
  label = "Loading",
  variant = "drive",
  elapsed = true,
  className,
}: {
  label?: string;
  variant?: LoadingVariant;
  elapsed?: boolean;
  className?: string;
}) {
  const time = useElapsed();
  return (
    <div role="status" className={cn("flex w-fit items-center gap-2.5 text-text-1", className)}>
      <LoaderGrid variant={variant} />
      <span className="text-[13px] font-medium text-text-2" style={{ animation: "shimmer-text 1.4s linear infinite" }}>
        {label}
      </span>
      {elapsed && <span className="mono-data text-[12px] text-text-3 tabular-nums">{time}</span>}
    </div>
  );
}
