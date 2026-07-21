---
"@edgecms/admin": minor
"@edgecms/runtime": minor
"@edgecms/cli": minor
"@edgecms/core": minor
"@edgecms/adapter-d1": minor
"edgecms": minor
---

Ship the redesigned admin dashboard and the Phase-2/AI backend it runs on.

**Admin UI** — full rebuild of `@edgecms/admin` to the new design: a CSS-variable
token system with light/dark theming and a runtime toggle, Geist type, a command
palette (⌘K), collapsible grouped sidebar, filter pills with saved filters,
toggleable table columns, a schema-driven editor with a TipTap toolbar, a
signature publish bar (unsaved-diff, scheduling, per-locale state), an AI-assist
panel, a version-history timeline with restore, media alt-text, tabbed settings
(users / API keys / webhooks / AI), toasts with undo, and typed-confirm dialogs.

**Backend** — derived publish `status` (draft/published/scheduled) exposed as
`publishStatus` alongside any user `status` field; append-only version history
(`_versions`) with list + restore endpoints; outbound webhooks (HMAC-signed,
fire-and-forget) with admin CRUD; per-user saved filters; Workers-AI routes
(alt-text / improve / translate) behind an injectable `AIProvider`, with
auto-alt-text and image-dimension sniffing on upload; and a `features` block on
`/admin/api/schema` for capability detection.

**Migrations** — `edgecms migrate`/`deploy` now reconcile the fixed system tables
on **every** run (idempotent `CREATE ... IF NOT EXISTS`), so newly added system
tables (webhooks, saved_filters) reach already-migrated projects, while the
config-diff journal and its "nothing to migrate" fast path are unchanged.

**CLI** — `edgecms dev` and `edgecms deploy` now serve the built admin SPA
(`@edgecms/admin`'s `dist/`) as Workers Assets automatically, and provision the
Workers AI binding when `ai.enabled`.
