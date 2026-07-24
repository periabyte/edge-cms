---
name: kalayaan
description: >
  Provision, migrate, deploy, and manage a Kalayaan project on Cloudflare — a
  config-driven headless CMS (D1/Postgres/MySQL, R2/S3 media, admin SPA, REST +
  GraphQL + MCP APIs). Use when a task involves scaffolding a CMS, editing
  cms.config.ts, running kalayaan login/init/dev/migrate/deploy, or driving content
  through the admin or MCP APIs. Follow the guardrails: always dry-run a
  migration first, and never pass --allow-destructive without explicit human
  approval.
---

# Kalayaan

Kalayaan turns a single `cms.config.ts` plus a Cloudflare API token into a
running CMS: a Worker serving a public content API, an authenticated admin API,
a schema-driven admin SPA, R2/S3 media, and optional AI + GraphQL + MCP
surfaces. Everything is derived from the config — collections, fields,
localization, auth, storage, and database engine.

## Golden path: empty directory → deployed URL

1. **Sign in, then scaffold.** `npx kalayaan login` does a one-time guided
   Cloudflare sign-in (opens a token page with permissions pre-filled, then
   auto-discovers the account). `npx kalayaan init` (or `--yes` with flags) is a
   guided wizard — content models, services (AI, email invites, custom domain,
   public submissions), then it writes `cms.config.ts` and `package.json`. Never
   hand-write these if `init` can produce them.
2. **Inspect the schema.** Read `cms.config.ts`. Collections and fields here are
   the single source of truth; the admin UI, the database schema, and the APIs
   are all generated from it.
3. **Dry-run the migration FIRST.** `npx kalayaan migrate --dry-run` prints the
   exact SQL. Read it. If it contains `DROP`, `rebuild`, or is flagged
   destructive, STOP and surface it to the human before doing anything else.
4. **Apply the migration.** `npx kalayaan migrate`. This only runs
   non-destructive changes. Destructive changes require `--allow-destructive`,
   which you must never add on your own initiative — ask first, every time.
5. **Run locally.** `npx kalayaan dev` serves the Worker + admin SPA on a local
   URL via wrangler. Use it to verify before deploying.
6. **Deploy.** `npx kalayaan deploy` idempotently provisions D1/R2/KV (and
   Hyperdrive/Vectorize when configured), applies pending migrations to the
   remote database, uploads the Worker + admin assets, attaches a custom domain
   when `domain` is set (or `--domain <host>`), and prints the live URL. Safe to
   re-run — it reconciles existing resources by name.
7. **First-run setup.** The first visit to `/admin` creates the initial admin
   user (or bootstrap non-interactively with `--admin-email`/`--admin-password`).

`deploy`/`down`/`doctor` use the credentials from `kalayaan login` (stored at
`~/.kalayaan/`), or `EDGE_API_TOKEN` + `EDGE_ACCOUNT_ID` for CI. Run
`npx kalayaan doctor` to check credentials, free-tier posture, and config health.
Tear everything down with `npx kalayaan down`.

## Guardrails (non-negotiable)

- **Dry-run before every migration.** Always `--dry-run` first and read the SQL.
- **Never auto-approve destructive changes.** `--allow-destructive` drops or
  rebuilds tables and can lose data. Only a human decides to pass it — you
  surface the diff and wait.
- **Config changes require redeploy.** The Worker bundles the config at build
  time; editing `cms.config.ts` has no effect until `migrate` + `deploy`.
- **Secrets never go in `.kalayaan/state.json`.** It's committed to git and holds
  only resource IDs and the migration journal. Session secrets and DB passwords
  live in Worker secrets / env.
- **External databases** (`database.adapter: "postgres" | "mysql"`) need
  `DATABASE_URL` set at deploy time; migrations are applied directly to that DB.

## Editing content programmatically

Access is governed by a permission model (an `Ability`): every request — from a
user or an API token — is checked as `action × subject`, where actions are
`read` / `create` / `update` / `delete` / `publish` / `manage` and subjects are
collection names or system areas (`media`, `users`, `api_keys`, `webhooks`,
`settings`, `ai`). Two authenticated surfaces:

- **REST admin API** under `/admin/api` (full CRUD, versions, media, users,
  keys). Public reads under `/api/v1` (published only), `/api/v1/search`, an
  optional `/api/graphql`, and anonymous `POST /api/v1/:collection` submissions
  (drafts, behind Turnstile) when the `public` role grants `create`.
- **MCP server** at `/mcp` (JSON-RPC) with tools: `list_collections`,
  `query_documents`, `get_document`, `search`, `create_document`,
  `update_document`, `publish`, `upload_media_from_url`, and `delete_document`
  (needs the `delete` permission). Each tool is authorized against the caller's
  ability on the target collection. Prefer MCP for agent-driven content work.

Create a **scoped API token** from the admin UI's Settings (or the admin API):
choose the exact actions and, optionally, the collections it's limited to, plus
an optional expiry. Tokens can be revoked; the secret is shown once. Grant the
minimum needed — read to query, add create/update/publish to author, and only
grant `delete` or `manage` when genuinely required.

## Common tasks

- **Add a field:** edit the collection in `cms.config.ts`, `migrate --dry-run`,
  review, `migrate`, `deploy`.
- **Add a collection:** same flow; new tables are non-destructive.
- **Rename/remove a field:** this is destructive (copy-rename or DROP). Dry-run,
  show the human the SQL, and only proceed with explicit approval.
- **Turn on services:** set the relevant block in `cms.config.ts` — `ai.features`
  / `graphql` (semantic search provisions Vectorize on deploy), `email.from`
  (email invites), `domain` (custom domain, attached on deploy), or a `public`
  role granting `create` (anonymous submissions; needs `TURNSTILE_SECRET`) — then
  `deploy` wires the bindings.
- **Custom domain:** add `domain: "blog.example.com"` to the config (or
  `deploy --domain <host>`). The domain must already be a zone in the Cloudflare
  account; deploy attaches it with automatic DNS + TLS, and degrades gracefully to
  the `*.workers.dev` URL if it isn't.
- **Invite a teammate:** create the user from Settings → Users; if email is
  configured they get an invite link by email, otherwise copy the returned link.
