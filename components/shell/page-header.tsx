import * as React from "react";
import { BlurFade } from "@/components/ui/blur-fade";
import { TextEffect } from "@/components/ui/text-effect";

/** Eyebrow + display title + optional actions. Staggered reveal: BlurFade (Magic UI) + TextEffect (Motion Primitives). */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <BlurFade duration={0.4} className="eyebrow mb-2">
            {eyebrow}
          </BlurFade>
        )}
        {typeof title === "string" ? (
          <TextEffect
            as="h1"
            per="word"
            preset="fade-in-blur"
            speedReveal={1.6}
            className="font-display text-[34px] leading-none text-text-1"
          >
            {title}
          </TextEffect>
        ) : (
          <BlurFade duration={0.5} delay={0.05}>
            <h1 className="font-display text-[34px] leading-none text-text-1">{title}</h1>
          </BlurFade>
        )}
        {description && (
          <BlurFade duration={0.5} delay={0.18} className="mt-2 max-w-2xl text-text-2">
            {description}
          </BlurFade>
        )}
      </div>
      {actions && (
        <BlurFade duration={0.5} delay={0.22} className="flex shrink-0 items-center gap-2">
          {actions}
        </BlurFade>
      )}
    </div>
  );
}
