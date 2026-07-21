---
"@edgecms/adapter-relational": minor
"@edgecms/adapter-d1": minor
"@edgecms/adapter-postgres": minor
"@edgecms/adapter-mysql": minor
"@edgecms/storage-s3": minor
"@edgecms/core": minor
"@edgecms/config": minor
"@edgecms/runtime": minor
"@edgecms/cli": minor
"edgecms": minor
---

Phases 3–5: adapters, AI, and distribution.

- **Adapters (Phase 3):** extracted a `SqlDialect` abstraction from D1's SQLite
  specifics and added `@edgecms/adapter-postgres` and `@edgecms/adapter-mysql`
  (real transactions, native DDL) plus `@edgecms/storage-s3`. The CLI provisions
  Hyperdrive for external databases and the runtime selects the adapter from
  `database.adapter`.
- **AI (Phase 4):** semantic search — `AIProvider.embed`, a Vectorize-backed
  index, embed-on-publish, and a public `/api/v1/search` with a SQL `contains`
  fallback.
- **Distribution (Phase 5):** plugin lifecycle hooks + custom field types; a
  config-generated GraphQL read API behind a flag; an MCP server at `/mcp` with
  scoped tools; a Cloudflare Access auth mode; the `edgecms-skill` package; and
  a `deploy` GitHub Action.
