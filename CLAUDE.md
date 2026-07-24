# CLAUDE.md

Guidance for working in this repo. Keep changes consistent with what's already here.

## What this is

Kalayaan — a config-driven, self-deploying headless CMS for Cloudflare. One `cms.config.ts` +
`kalayaan login → init → deploy` yields a live site on Workers + D1 + R2 + KV. pnpm workspace +
Turborepo, TypeScript, ESM. **Mission:** free, low-friction self-hosting for solo devs / aspiring
builders — keep the free path free and setup friction low. Full plan: `docs/development-plan.md`.

## Commands

```sh
pnpm build          # turbo build (respects package graph)
pnpm typecheck      # tsc --noEmit across packages
pnpm test           # vitest (node + @cloudflare/vitest-pool-workers)
pnpm --filter @edgecms/<pkg> test   # one package
```

Always run `pnpm build && pnpm typecheck && pnpm test` before considering a change done. Packages
depend on each other's `dist/`, so **rebuild `@edgecms/config` / `@edgecms/core` after editing them**
before typechecking a downstream package.

## Admin UI conventions (`packages/admin`)

- **Reuse the already-built components — do not reinvent primitives.** The design system is
  **shadcn/ui** (Radix-backed, "new-york" style) under `packages/admin/src/components/ui/*` — one file
  per primitive (`button`, `input`, `textarea`, `label`, `select`, `card`, `badge`, `checkbox`,
  `skeleton`, `dialog`, `alert-dialog`, `popover`, `tabs`, `dropdown-menu`, `command`, `sonner`,
  `form`). `packages/admin/src/components/ui.tsx` is a thin barrel re-exporting the common ones (`cn`,
  `Button`, `Input`, `Textarea`, `Label`, `Card`, `Badge`, `Skeleton`) plus the domain-only pieces that
  have no shadcn equivalent and live only there: `Select` (a **native** `<select>` — do not confuse
  with the Radix `Select` at `components/ui/select`, still used directly by newer call sites), `Kbd`,
  `StatusBadge`, `Spinner`, `ErrorBanner`, `EmptyState`, `ErrorState`. Composite overlays —
  `CommandPalette` (cmdk), `ConfirmDialog` (Radix `AlertDialog`, exposes `useConfirm()`), `Popover`
  (Radix, controlled `open`/`onClose` API), `MediaPicker` (Radix `Dialog`), `Layout`, and `toast`
  (Sonner, exposes `useToast()`) — wrap Radix/cmdk/Sonner internally but keep their original call
  signatures. Compose all of these before writing anything new.
- `components.json` (shadcn CLI config) lives at the package root; the `@/*` path alias (→ `src/*`) is
  wired into `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts` — new shadcn-style files should
  import via `@/components/ui/...` / `@/lib/utils`, matching what the CLI would generate.
- **Design tokens are CSS variables in `src/index.css`, consumed as `hsl(var(--x) / <alpha-value>)`.**
  Token *values* are bare HSL channel triplets (`--brand: 21 90% 48%`, no `hsl()` wrapper) so Tailwind
  opacity modifiers work (`bg-brand/50`). **Any raw `var(--token)` used directly as a CSS color
  (inline `style`, arbitrary Tailwind values like `shadow-[..._var(--x)]`, `color-mix()`, etc.) MUST be
  wrapped in `hsl(...)`** — a bare triplet isn't a valid color on its own. `--primary`/`--secondary`/
  `--destructive`/`--radius` are shadcn-convention aliases onto `brand`/`muted`/`danger` so stock
  shadcn components render correctly unmodified; prefer the semantic names (`brand`, `danger`, `draft`,
  `published`, `mt`) in app code — those have no shadcn equivalent and carry this app's domain meaning
  (editorial workflow states, machine-translation review). Never hard-code colors; a rebrand should
  stay a one-token change. `tailwindcss-animate` powers overlay enter/exit transitions via
  `data-[state=open]:animate-in fade-in-0 zoom-in-95`-style utilities on the Radix components — don't
  name a custom CSS class `animate-in`/`animate-out`/`fade-in-*`/`zoom-in-*`/`slide-in-from-*`, that
  collides with the plugin's utility names.
- Match the existing look: sizes, radii, spacing, and semantic state colors (draft/published/danger)
  already have tokens — use them.
- **Forms: use `react-hook-form` + `zod`** (with `@hookform/resolvers/zod`), rendered via
  `components/ui/form.tsx`'s `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage` (see
  `routes/Login.tsx` for the canonical shape). Shared schemas live in `src/lib/schemas.ts`
  (route-specific ones, like `DocumentEditor`'s dynamically-built per-collection schema, stay local to
  their file). Mutation-level errors (failed API calls) still render via `ErrorBanner` above the form —
  `FormMessage` is for field-level zod validation only. Data fetching/mutations go through
  `@tanstack/react-query` hooks in `src/lib/hooks.ts`; tables use `@tanstack/react-table`; icons are
  `lucide-react`.
- Copy is user-facing: name things by what people recognize, buttons state the action ("Publish",
  not "Submit"), errors say what to do.

## Codebase conventions

- **ESM everywhere**, `.js` extensions on relative imports (TS resolves to `.ts`).
- **Config is the source of truth.** Collections/fields/roles/services are defined in `cms.config.ts`
  and validated by `@edgecms/config` (zod). The Worker **bundles the config at build time** — config
  changes require `migrate` + redeploy, never a hot reload.
- **Auth & access:** every request resolves to an `Ability` (`action × subject`); gate routes with
  `requirePermission()` / `publicAuth()` (`packages/runtime/src/auth/middleware.ts`). Don't reintroduce
  the old `read`/`write`/`manage` scope strings — that model was replaced by config-defined roles +
  granular token grants.
- **Providers follow one seam:** `AIProvider` / `EmailProvider` interfaces in `@edgecms/core`, a
  binding-backed impl in `@edgecms/runtime`, injected in `app.ts`, mocked in tests. Add new
  capabilities the same way.
- **CLI state:** resource IDs + migration journal live in `.kalayaan/state.json` (committed, no
  secrets). User credentials from `kalayaan login` live in `~/.kalayaan/credentials.json` (0600).

## Testing conventions

- Adapter/runtime tests run against real D1/R2/KV under Miniflare (`@cloudflare/vitest-pool-workers`),
  not mocks. Keep pure logic (query builder, DDL, permissions) in the node pool.
- **Workers-pool isolated storage is fragile:** seed the DB in `beforeAll`, do `SELF.fetch` calls in
  test bodies (not in `before*` hooks), and keep a file to a few broad tests — many small `it`s or
  worker requests in hooks desync the storage stack and fail teardown. See
  `packages/runtime/test/workers/rbac.test.ts` for the working pattern.
- **Green tests aren't enough.** The real bugs here surface only by driving the CLI-scaffolded
  project under real `wrangler dev` / a real deploy. Verify behavior end-to-end for anything touching
  the runtime or CLI.

## Safety

- Migrations: `kalayaan migrate --dry-run` first; **never** `--allow-destructive` without explicit human
  approval.
- Commit only when asked. End commit messages with the Co-Authored-By / session trailers already used
  in this repo's history.

## Docs

`docs/development-plan.md` (plan + status), `docs/custom-domains.md`, `docs/roadmap-email-plugins.md`,
`docs/design-handoff.md` (design briefs). Keep these current when features land.
