"use client";

/**
 * Opensource UI `TextLoader` (https://opensourceui.in, MIT © bidyut10).
 * Rotating glass orb plus letter-by-letter pulse. Adapted for Qalaa: schemes reduced to
 * the lime / sky accents, `motion-reduce` honoured via Web Animations fallback.
 */

import { useEffect, useRef } from "react";
import { cn } from "cn";

export type TextLoaderVariant = "lime" | "sky";

const SCHEMES: Record<TextLoaderVariant, { midBg: string; shadows: [string, string, string] }> = {
  lime: {
    midBg: "#3f5a10",
    shadows: [
      "0 1px 1px 0 #fff inset, 0 3px 5px 0 #d0ff78 inset, 0 4px 4px 0 #71c5e8 inset",
      "0 1px 1px 0 #fff inset, 0 3px 5px 0 #9fd63e inset, 0 4px 4px 0 #b5e3f1 inset",
      "0 1px 1px 0 #fff inset, 0 3px 5px 0 #d0ff78 inset, 0 4px 4px 0 #99d6ea inset",
    ],
  },
  sky: {
    midBg: "#1c3f4f",
    shadows: [
      "0 1px 1px 0 #fff inset, 0 3px 5px 0 #99d6ea inset, 0 4px 4px 0 #71c5e8 inset",
      "0 1px 1px 0 #fff inset, 0 3px 5px 0 #71c5e8 inset, 0 4px 4px 0 #d0ff78 inset",
      "0 1px 1px 0 #fff inset, 0 3px 5px 0 #b5e3f1 inset, 0 4px 4px 0 #99d6ea inset",
    ],
  },
};

function Orb({ scheme }: { scheme: (typeof SCHEMES)[TextLoaderVariant] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.style.transform = "rotate(270deg)";
      node.style.backgroundColor = scheme.midBg;
      node.style.boxShadow = scheme.shadows[1];
      return;
    }
    const animation = node.animate(
      [
        { transform: "rotate(90deg)", backgroundColor: "transparent", boxShadow: scheme.shadows[0] },
        { transform: "rotate(270deg)", backgroundColor: scheme.midBg, boxShadow: scheme.shadows[1], offset: 0.5 },
        { transform: "rotate(450deg)", backgroundColor: "transparent", boxShadow: scheme.shadows[2] },
      ],
      { duration: 1500, iterations: Number.POSITIVE_INFINITY, easing: "linear" },
    );
    return () => animation.cancel();
  }, [scheme]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="z-0 size-5 shrink-0 rounded-full bg-transparent will-change-transform"
      style={{ transform: "rotate(90deg)" }}
    />
  );
}

export function TextLoader({
  text = "Searching",
  variant = "lime",
  className,
}: {
  text?: string;
  variant?: TextLoaderVariant;
  className?: string;
}) {
  const scheme = SCHEMES[variant];
  return (
    <div
      data-slot="text-loader"
      className={cn("relative flex items-center gap-2.5 select-none text-text-1", className)}
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      <Orb scheme={scheme} />
      <div className="flex gap-px" aria-hidden="true">
        {text.split("").map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="inline-block animate-pulse opacity-40 will-change-[opacity] motion-reduce:animate-none motion-reduce:opacity-100"
            style={{ animationDuration: "1.8s", animationDelay: `${index * 0.09}s` }}
          >
            {letter === " " ? "\u00a0" : letter}
          </span>
        ))}
      </div>
    </div>
  );
}
