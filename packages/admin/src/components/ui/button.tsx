import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Variant naming: this project's pre-existing call sites used `variant="brand"`
// / `variant="danger"`, plus `size="sm"` / `size="md"` (default). shadcn's stock
// button uses `default` / `destructive`. We renamed all call sites to the
// shadcn names (`default`/`destructive`) rather than keep custom aliases, so
// this stays a stock shadcn button going forward. `secondary` is kept as a
// CUSTOM variant (not shadcn's `outline`) because the existing look
// (bg-card border text-foreground hover:bg-accent) already matches this
// project's "secondary" semantics closer than shadcn's plain outline button.
// `md` is added as a custom size and is the default, matching every existing
// bare `<Button>` call site; shadcn's `default`/`lg`/`icon` sizes are also
// available for new call sites.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-brand",
  {
    variants: {
      variant: {
        default: "bg-brand border border-brand text-brand-foreground hover:bg-brand-hover shadow-token",
        secondary: "bg-card border border-border text-foreground hover:bg-accent",
        ghost: "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive:
          "bg-transparent border border-border text-danger-fg hover:bg-danger-subtle hover:border-danger",
        outline: "border border-input bg-card hover:bg-accent hover:text-accent-foreground",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 text-[13px]",
        md: "h-9 px-3.5 text-[13px]",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "h-9 w-9 shrink-0 px-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
