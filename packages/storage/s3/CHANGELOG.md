# @kalayaan/storage-s3

## 0.1.1

### Patch Changes

- @kalayaan/core@0.1.1

## 0.1.0

### Minor Changes

- a709a05: Phases 3–5: adapters, AI, and distribution.

  - **Adapters (Phase 3):** extracted a `SqlDialect` abstraction from D1's SQLite
    specifics and added `@kalayaan/adapter-postgres` and `@kalayaan/adapter-mysql`
    (real transactions, native DDL) plus `@kalayaan/storage-s3`. The CLI provisions
    Hyperdrive for external databases and the runtime selects the adapter from
    `database.adapter`.
  - **AI (Phase 4):** semantic search — `AIProvider.embed`, a Vectorize-backed
    index, embed-on-publish, and a public `/api/v1/search` with a SQL `contains`
    fallback.
  - **Distribution (Phase 5):** plugin lifecycle hooks + custom field types; a
    config-generated GraphQL read API behind a flag; an MCP server at `/mcp` with
    scoped tools; a Cloudflare Access auth mode; the `edgecms-skill` package; and
    a `deploy` GitHub Action.

### Patch Changes

- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
- Updated dependencies [a709a05]
  - @kalayaan/core@0.1.0
