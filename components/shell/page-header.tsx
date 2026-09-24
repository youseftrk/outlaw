import * as React from "react";
import { BlurFade } from "@/components/ui/blur-fade";

/** Eyebrow + display title + optional actions. Composition only (shadcn/Magic UI primitives). */
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
    <BlurFade duration={0.5} className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-[34px] leading-none text-text-1">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-text-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </BlurFade>
  );
}
