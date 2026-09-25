"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "cn"

import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  "group/button relative isolate inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(208,255,120,0.18),0_6px_18px_-8px_rgba(208,255,120,0.5)] hover:bg-primary/90 hover:shadow-[0_0_0_1px_rgba(208,255,120,0.35),0_10px_26px_-8px_rgba(208,255,120,0.7)]",
        outline:
          "border-border bg-background hover:border-primary/40 hover:bg-muted hover:text-foreground hover:shadow-[0_0_0_1px_rgba(153, 214, 234,0.18),0_0_18px_-6px_rgba(153, 214, 234,0.4)] aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-[0_0_0_1px_rgba(153, 214, 234,0.2)]",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--destructive)_35%,transparent)] focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "overflow-visible text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 rounded-[min(var(--radius-md),10px)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type MotionConflicts =
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"

type PrimitiveProps = Omit<ButtonPrimitive.Props, MotionConflicts | "style"> & {
  style?: React.CSSProperties
}

const MotionButtonPrimitive = motion.create(
  ButtonPrimitive as React.ForwardRefExoticComponent<PrimitiveProps & React.RefAttributes<HTMLElement>>
)

const PRESS = { type: "spring", stiffness: 520, damping: 28, mass: 0.6 } as const

type Ripple = { id: number; x: number; y: number; size: number }

type ButtonProps = PrimitiveProps &
  VariantProps<typeof buttonVariants> & {
    /** Swaps the leading content for a spinner and disables the button. */
    loading?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  onPointerDown,
  ...props
}: ButtonProps) {
  const reduced = useReducedMotion()
  const [ripples, setRipples] = React.useState<Ripple[]>([])
  const isIcon = typeof size === "string" && size.startsWith("icon")
  const isLink = variant === "link"
  const cuelume = variant === "default" ? { "data-cuelume-press": "", "data-cuelume-release": "" } : {}

  const handlePointerDown = (event: Parameters<NonNullable<PrimitiveProps["onPointerDown"]>>[0]) => {
    onPointerDown?.(event)
    if (reduced || isLink || event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const dim = Math.max(rect.width, rect.height) * (isIcon ? 2.2 : 1.6)
    setRipples((r) => [
      ...r.slice(-3),
      { id: event.timeStamp, x: event.clientX - rect.left, y: event.clientY - rect.top, size: dim },
    ])
  }

  return (
    <MotionButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onPointerDown={handlePointerDown}
      {...cuelume}
      whileTap={reduced || isLink ? undefined : { scale: isIcon ? 0.88 : 0.96 }}
      whileHover={reduced || isLink || isIcon ? undefined : { y: -1 }}
      transition={PRESS}
      {...props}
    >
      {!isLink && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
        >
        <AnimatePresence>
          {ripples.map((r) => (
            <motion.span
              key={r.id}
              className="absolute rounded-full bg-current"
              style={{ left: r.x - r.size / 2, top: r.y - r.size / 2, width: r.size, height: r.size }}
              initial={{ scale: 0, opacity: isIcon ? 0.35 : 0.22 }}
              animate={{ scale: 1, opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => setRipples((list) => list.filter((x) => x.id !== r.id))}
            />
          ))}
        </AnimatePresence>
        </span>
      )}
      {loading && <Spinner data-icon="inline-start" />}
      {children}
    </MotionButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
