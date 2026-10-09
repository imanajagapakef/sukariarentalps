import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-transparent bg-clip-padding text-sm font-bold uppercase tracking-wide whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-[2px] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Arcade primary action: Sukaria green, near-black text, hard-edge drop,
        // 2px tactile microswitch press (translate-y + shadow collapse).
        default:
          "bg-primary-container text-on-primary-container shadow-arcade hover:bg-primary-container/85 active:shadow-none",
        outline:
          "border-off-white bg-transparent text-off-white shadow-arcade-sm hover:bg-off-white hover:text-surface active:shadow-none",
        secondary:
          "bg-surface-high text-on-surface shadow-arcade-sm hover:bg-surface-highest active:shadow-none",
        ghost:
          "border-transparent bg-transparent hover:bg-muted hover:text-foreground active:bg-muted/60",
        destructive:
          "bg-surface-low border-danger/70 text-danger shadow-arcade-coral hover:bg-danger/10 active:shadow-none",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 gap-2 px-5",
        xs: "h-8 gap-1 rounded-md px-2 text-xs tracking-normal normal-case [&_svg:not([class*='size-'])]:size-3",
        sm: "h-11 gap-1.5 px-3.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[52px] gap-2 px-7 text-base [&_svg:not([class*='size-'])]:size-5",
        icon: "size-12",
        "icon-xs": "size-8 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-11 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-[52px] [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
