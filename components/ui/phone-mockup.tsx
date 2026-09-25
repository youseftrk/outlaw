import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "cn";

/**
 * Opensource UI `PhoneMockupCard` (MIT, github.com/bidyut10/opensourceui), adapted for Qalaa:
 * fluid width (fills its container), Pantone-neutral frame finishes, dark screen slot.
 */

const FINISHES = {
  graphite: { frame: "bg-[#25282a]", button: "bg-[#333f48]", shine: "from-white/10 via-white/0 to-black/30" },
  titanium: { frame: "bg-[#75787b]", button: "bg-[#53565a]", shine: "from-white/25 via-white/0 to-black/25" },
  black: { frame: "bg-[#101820]", button: "bg-[#25282a]", shine: "from-white/8 via-white/0 to-black/40" },
} as const;

export type PhoneFinish = keyof typeof FINISHES;

export interface PhoneMockupProps extends ComponentPropsWithoutRef<"div"> {
  finish?: PhoneFinish;
  showDynamicIsland?: boolean;
  /** Screen background behind children. */
  screenClassName?: string;
  children?: ReactNode;
}

const side = "absolute w-[1.2%] rounded-l-[2px]";

function SideButtons({ finish }: { finish: (typeof FINISHES)[PhoneFinish] }) {
  return (
    <>
      <div className={cn(side, finish.button, "top-[15.5%] -left-[1.2%] h-[3.2%]")} aria-hidden="true" />
      <div className={cn(side, finish.button, "top-[21%] -left-[1.2%] h-[7.2%]")} aria-hidden="true" />
      <div className={cn(side, finish.button, "top-[30.5%] -left-[1.2%] h-[7.2%]")} aria-hidden="true" />
      <div className={cn(side, finish.button, "top-[23%] -right-[1.2%] h-[11.5%] rounded-l-none rounded-r-[2px]")} aria-hidden="true" />
    </>
  );
}

/** iPhone proportions 70.6 × 146.6 mm, thin uniform bezel, Dynamic Island, home indicator. */
export const PhoneMockup = forwardRef<HTMLDivElement, PhoneMockupProps>(
  ({ className, children, finish = "graphite", showDynamicIsland = true, screenClassName, ...props }, ref) => {
    const f = FINISHES[finish];
    return (
      <div
        ref={ref}
        data-slot="phone-mockup"
        data-finish={finish}
        className={cn("relative aspect-[70.6/146.6] w-full rounded-[13%/6.3%] p-[1.1%]", f.frame, className)}
        {...props}
      >
        <div className={cn("pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br", f.shine)} aria-hidden="true" />
        <SideButtons finish={f} />
        <div className="relative h-full w-full overflow-hidden rounded-[12.5%/6%] bg-black">
          <div className={cn("absolute inset-[1.3%] overflow-hidden rounded-[11.5%/5.6%] bg-bg-0", screenClassName)}>
            <div className="relative h-full w-full">{children}</div>
            {showDynamicIsland && (
              <div className="absolute top-[1.2%] left-1/2 z-20 h-[2.6%] w-[27%] -translate-x-1/2 rounded-full bg-black" aria-hidden="true">
                <div className="absolute top-1/2 right-[8%] aspect-square h-[38%] -translate-y-1/2 rounded-full bg-[#6a90c8]/25" aria-hidden="true" />
              </div>
            )}
            <div className="absolute bottom-[0.9%] left-1/2 z-20 h-[0.45%] w-[32%] -translate-x-1/2 rounded-full bg-white/25" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  },
);
PhoneMockup.displayName = "PhoneMockup";
