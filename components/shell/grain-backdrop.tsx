"use client";

import * as React from "react";
import { GrainGradient } from "@paper-design/shaders-react";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

const COLOR_BACK = "#0c0e11";
const COLORS = ["#d0ff78", "#e6e6e0", "#7a7f88"];

/** True when a webgl2 context can actually be created (headless / GPU-off browsers return null). */
function detectWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * Ambient page backdrop — Paper Shaders GrainGradient, fixed behind the content.
 * The wrapper div already paints `colorBack`, so when WebGL is unavailable (or the
 * shader mount can't initialize) the page silently falls back to the flat color.
 */
export function GrainBackdrop({
  className,
  /**
   * "fixed" paints behind the whole viewport (standalone pages like login/phone);
   * "absolute" fills the nearest positioned ancestor — use it for an in-page hero band.
   */
  position = "fixed",
}: {
  className?: string;
  position?: "fixed" | "absolute";
}) {
  const reduced = useReducedMotion();
  // WebGL is only detectable on the client — the server snapshot is always false,
  // so the flat colorBack paints during SSR/fallback either way.
  const webgl = React.useSyncExternalStore(
    () => () => {},
    detectWebGL2,
    () => false,
  );

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none inset-0", position === "fixed" ? "fixed -z-10" : "absolute", className)}
      style={{ background: COLOR_BACK }}
    >
      {webgl && (
        <GrainGradient
          colors={COLORS}
          colorBack={COLOR_BACK}
          softness={0.7}
          intensity={0.15}
          noise={0.5}
          shape="wave"
          speed={reduced ? 0 : 1}
          width="100%"
          height="100%"
        />
      )}
    </div>
  );
}
