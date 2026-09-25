"use client";

/**
 * Aceternity UI `world-map` (dotted-map + motion), adapted for Qalaa:
 * - always-dark palette driven by brand tokens (no next-themes dependency)
 * - per-arc colour, plus standalone `markers` (protected servers) with status colours
 * - dotted map memoised (it was rebuilt on every render upstream)
 */
import { useMemo, useRef } from "react";
import { motion } from "motion/react";
import DottedMap from "dotted-map";

export interface MapArc {
  start: { lat: number; lng: number; label?: string };
  end: { lat: number; lng: number; label?: string };
  color?: string;
}

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  /** 1 = normal, 2 = emphasised (pulsing ring) */
  weight?: 1 | 2;
}

interface MapProps {
  dots?: MapArc[];
  markers?: MapMarker[];
  lineColor?: string;
  dotColor?: string;
  className?: string;
}

const projectPoint = (lat: number, lng: number) => ({
  x: (lng + 180) * (800 / 360),
  y: (90 - lat) * (400 / 180),
});

const createCurvedPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
  const midX = (start.x + end.x) / 2;
  const midY = Math.min(start.y, end.y) - 50;
  return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
};

export default function WorldMap({
  dots = [],
  markers = [],
  lineColor = "#ff9a5c",
  dotColor = "rgba(214, 240, 246, 0.22)",
  className = "",
}: MapProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const svgMap = useMemo(() => {
    const map = new DottedMap({ height: 100, grid: "diagonal" });
    return map.getSVG({ radius: 0.22, color: dotColor, shape: "circle", backgroundColor: "transparent" });
  }, [dotColor]);

  return (
    <div className={`relative aspect-[2/1] w-full font-sans ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- aceternity upstream: inline SVG data URI generated at render time; not optimisable by next/image */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        className="pointer-events-none h-full w-full select-none [mask-image:linear-gradient(to_bottom,transparent,white_8%,white_92%,transparent)]"
        alt=""
        height="495"
        width="1056"
        draggable={false}
      />
      <svg ref={svgRef} viewBox="0 0 800 400" className="pointer-events-none absolute inset-0 h-full w-full select-none">
        <defs>
          {dots.map((dot, i) => {
            const c = dot.color ?? lineColor;
            return (
              <linearGradient key={`grad-${i}`} id={`arc-gradient-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={c} stopOpacity="0" />
                <stop offset="8%" stopColor={c} stopOpacity="1" />
                <stop offset="92%" stopColor={c} stopOpacity="1" />
                <stop offset="100%" stopColor={c} stopOpacity="0" />
              </linearGradient>
            );
          })}
        </defs>

        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);
          return (
            <motion.path
              key={`arc-${i}-${dot.start.lat}-${dot.end.lat}`}
              d={createCurvedPath(startPoint, endPoint)}
              fill="none"
              stroke={`url(#arc-gradient-${i})`}
              strokeWidth="1"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.25 * i, ease: [0.16, 1, 0.3, 1] }}
            />
          );
        })}

        {dots.map((dot, i) => {
          const c = dot.color ?? lineColor;
          const s = projectPoint(dot.start.lat, dot.start.lng);
          return (
            <g key={`origin-${i}`}>
              <circle cx={s.x} cy={s.y} r="1.8" fill={c} />
              <circle cx={s.x} cy={s.y} r="1.8" fill={c} opacity="0.5">
                <animate attributeName="r" from="2" to="9" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.5" to="0" dur="1.6s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {markers.map((m, i) => {
          const p = projectPoint(m.lat, m.lng);
          const c = m.color ?? "#24c7d6";
          return (
            <g key={`marker-${i}-${m.lat}-${m.lng}`}>
              <circle cx={p.x} cy={p.y} r={m.weight === 2 ? 3 : 2.2} fill={c} />
              <circle cx={p.x} cy={p.y} r={m.weight === 2 ? 3 : 2.2} fill="none" stroke={c} strokeWidth="0.6" opacity="0.6">
                <animate attributeName="r" from="3" to={m.weight === 2 ? "12" : "8"} dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="2.4s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
