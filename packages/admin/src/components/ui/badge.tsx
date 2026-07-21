import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Extends shadcn's default/secondary/destructive/outline set with this
// project's domain tones (draft/published/scheduled/danger/mt), which map
// onto the `*-subtle` / `*-fg` token pairs. `StatusBadge` (in ui.tsx) is a
// thin domain wrapper built on top of these tones.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40",
  {
    variants: {
      variant: {
        default: "bg-brand text-brand-foreground",
        secondary: "bg-muted text-muted-foreground",
        destructive: "bg-danger-subtle text-danger-fg",
        outline: "text-foreground border border-border",
        neutral: "bg-muted text-muted-foreground",
        draft: "bg-draft-subtle text-draft-fg",
        published: "bg-published-subtle text-published-fg",
        scheduled: "bg-brand-subtle text-brand-subtle-fg",
        danger: "bg-danger-subtle text-danger-fg",
        mt: "bg-mt-subtle text-mt-fg",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
