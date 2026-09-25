"use client";
/**
 * Aceternity UI `timeline`, adapted for Qalaa: demo heading removed, compact spacing,
 * brand beam colours, per-entry tone (observed / blocked / prevented) and meta line.
 * Keeps the upstream mechanic: a scroll-progress beam fills the rail as you read down.
 */
import { motion, useScroll, useTransform } from "motion/react";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type TimelineTone = "neutral" | "observed" | "blocked" | "prevented" | "active";

export interface TimelineEntry {
  title: string;
  meta?: React.ReactNode;
  content: React.ReactNode;
  tone?: TimelineTone;
}

const DOT: Record<TimelineTone, string> = {
  neutral: "bg-bg-3 border-line-strong",
  observed: "bg-sev-critical/20 border-sev-critical",
  blocked: "bg-lime/20 border-lime",
  prevented: "bg-lime border-lime",
  active: "bg-cerulean/20 border-cerulean animate-pulse-soft",
};

export const Timeline = ({ data, className }: { data: TimelineEntry[]; className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) setHeight(ref.current.getBoundingClientRect().height);
  }, [data.length]);

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start 60%", "end 70%"] });
  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  return (
    <div className={cn("w-full font-sans", className)} ref={containerRef}>
      <div ref={ref} className="relative pb-4">
        {data.map((item, index) => (
          <div key={index} className="flex justify-start gap-4 pt-5 first:pt-1">
            <div className="relative z-10 flex w-8 shrink-0 justify-center pt-1">
              <div className={cn("size-3.5 rounded-full border-2 ring-4 ring-bg-1", DOT[item.tone ?? "neutral"])} />
            </div>
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-display text-[18px] leading-tight text-text-1">{item.title}</h3>
                {item.meta && <span className="mono-data text-[11px] text-text-3">{item.meta}</span>}
              </div>
              <div className="mt-1.5 text-text-2">{item.content}</div>
            </div>
          </div>
        ))}
        <div
          style={{ height: height + "px" }}
          className="absolute left-[15px] top-0 w-[2px] overflow-hidden bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent from-[0%] via-line-strong to-transparent to-[99%] [mask-image:linear-gradient(to_bottom,transparent_0%,black_6%,black_94%,transparent_100%)]"
        >
          <motion.div
            style={{ height: heightTransform, opacity: opacityTransform }}
            className="absolute inset-x-0 top-0 w-[2px] rounded-full bg-gradient-to-t from-lime via-cerulean to-transparent from-[0%] via-[10%]"
          />
        </div>
      </div>
    </div>
  );
};
