import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "../lib/utils";

/**
 * One button family (dealt style: solid). Every size is at least 44px tall outside dense UI.
 * Hover steps up 1px, press settles down: the motion layer the taste rules ask for.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none",
    "transition-[transform,background-color,color,box-shadow] duration-200 ease-[var(--ease-out)]",
    "hover:-translate-y-px active:translate-y-px active:duration-75",
    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-background hover:bg-destructive/90",
        link: "text-foreground underline-offset-4 hover:underline hover:translate-y-0 active:translate-y-0",
      },
      size: {
        default: "h-11 px-5 text-[15px]",
        sm: "h-9 px-3.5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
