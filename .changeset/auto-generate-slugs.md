---
"@edgecms/adapter-relational": minor
"@edgecms/admin": minor
---

Auto-generate slug fields from their source.

Slug fields (`field.slug({ from: "title" })`) previously stored whatever the client
sent — nothing if left blank. Now:

- **Server (guarantee):** on create, when a slug field is empty, the relational adapter
  generates one with `slugify(source)` — so slugs always exist regardless of client
  (admin, MCP, API keys). Applies to D1/Postgres/MySQL.
- **Admin (live preview):** while creating a new entry, the editor fills the slug from
  its source field as you type, until you edit the slug yourself; existing entries keep
  their slug stable.
- **Auto-dedupe:** for `unique` slug fields, a colliding slug (generated or provided) is
  disambiguated with a numeric suffix — `dupe-title`, `dupe-title-2`, `dupe-title-3` —
  scoped per-locale for localized collections. Best-effort against concurrent writes;
  the DB's unique constraint remains the hard guarantee.
