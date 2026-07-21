// Barrel: re-exports the shadcn/ui primitives (src/components/ui/*) plus
// the domain-specific wrappers that have no shadcn equivalent, so every
// existing `from "../components/ui.js"` / `from "./ui.js"` import across
// routes/components/fields keeps resolving unchanged. New code should
// prefer importing straight from `@/components/ui/<primitive>` (or
// `@/lib/utils` for `cn`); this file exists for backward compatibility with
// the pre-shadcn call sites.
import type { ReactNode, SelectHTMLAttributes } from "react";

import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { cn } from "../lib/utils.js";
import type { PublishStatus } from "../lib/types.js";

export { cn } from "../lib/utils.js";
export { Button } from "./ui/button.js";
export { Input } from "./ui/input.js";
export { Textarea } from "./ui/textarea.js";
export { Label } from "./ui/label.js";
export { Card } from "./ui/card.js";
export { Badge } from "./ui/badge.js";
export { Skeleton } from "./ui/skeleton.js";

// NOT the shadcn Radix select (see src/components/ui/select.tsx) — this is
// the original native-<select>-based component, kept under the same `Select`
// name for backward compatibility. Rewiring call sites (SelectFieldEditor,
// the relation picker, Settings, DocumentEditor's schedule pickers) onto the
// Radix version is Phase 2 work; both can coexist since they live in
// different files.
export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-input bg-card px-3 h-10 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-brand",
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-mono text-[11px] bg-card border border-border rounded px-1.5 py-0.5 text-muted-foreground">
      {children}
    </kbd>
  );
}

/** Publish-state badge: reads the runtime's publishStatus + mt flag. Rebuilt on the new cva Badge. */
export function StatusBadge({ status, mt }: { status?: PublishStatus | string | undefined; mt?: boolean | undefined }) {
  if (mt) {
    return (
      <Badge variant="mt">
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        MT review
      </Badge>
    );
  }
  const variant = status === "published" ? "published" : status === "scheduled" ? "scheduled" : "draft";
  const label = status === "published" ? "Published" : status === "scheduled" ? "Scheduled" : "Draft";
  return (
    <Badge variant={variant}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={cn("inline-block rounded-full border-2 border-current border-t-transparent", className)}
      style={{ width: 16, height: 16, animation: "ecms-spin .7s linear infinite" }}
    />
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger-fg">{message}</div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center p-10">
      <div className="max-w-md text-center">
        {icon && (
          <div className="w-13 h-13 mx-auto mb-4 rounded-2xl bg-brand-subtle text-brand-subtle-fg flex items-center justify-center" style={{ width: 52, height: 52 }}>
            {icon}
          </div>
        )}
        <h3 className="text-[17px] font-semibold mb-1.5">{title}</h3>
        {description && <p className="text-muted-foreground text-[13px]">{description}</p>}
        {action && <div className="mt-4 flex gap-2 justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ title, description, onRetry }: { title: string; description?: string; onRetry?: () => void }) {
  return (
    <div className="h-full flex items-center justify-center p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 rounded-2xl bg-danger-subtle text-danger flex items-center justify-center" style={{ width: 52, height: 52 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold mb-1.5">{title}</h3>
        {description && <p className="text-muted-foreground text-[13px] mb-4">{description}</p>}
        {onRetry && (
          <Button variant="default" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
