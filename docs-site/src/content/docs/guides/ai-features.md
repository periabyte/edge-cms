---
title: AI features
description: Alt-text, translation, editorial assist, and optional semantic search — powered by Workers AI.
---

EdgeCMS's AI features run on Workers AI — no separate API key or third-party account to set up.
Turn them on in `cms.config.ts`:

```ts
export default defineConfig({
  // ...
  ai: {
    enabled: true,
    features: ["alt-text", "translate", "editorial-assist"],
  },
});
```

`features` picks which capabilities are active: `"alt-text"`, `"translate"`, `"editorial-assist"`,
and `"semantic-search"` (see the [free-tier note](#semantic-search-the-one-paid-feature) below —
this one is different from the rest).

## What each feature does

- **Alt-text** — generates alt text for uploaded media automatically.
- **Translate** — translates a document's content into another configured locale.
- **Editorial assist** — a family of per-field actions: improve writing, summarize, and generate an
  SEO title/description. Attach one to a specific field with `aiEnrich`:

  ```ts
  body: field.richText({
    aiEnrich: { action: "improve" },
  }),
  excerpt: field.text({
    aiEnrich: { action: "summarize", dependency: "body" },
  }),
  ```

  `dependency` names the field to read source text from (omit it to have the action rewrite the
  field in place). This renders as a small inline "Generate with AI" control right on that field in
  the admin editor — not a generic sidebar panel — so it's always obvious which part of the
  document an AI action affects.

## Semantic search (the one paid feature)

Turning on `"semantic-search"` adds a public search endpoint:

```
GET /api/v1/search?q=<query>&collection=<name>&locale=<locale>&limit=20
```

Only `q` is required. Semantic search needs **Vectorize**, which is on Cloudflare's paid Workers
plan — everything else in EdgeCMS runs on the permanent free tier. To keep the free path free by
default:

- `edgecms doctor` and `edgecms deploy` print a heads-up the moment `semantic-search` is enabled,
  so you always know before you deploy.
- Without Vectorize, `/api/v1/search` still works — it falls back to a plain SQL text-match scan,
  just without semantic ranking.

## No AI features enabled?

Everything above is opt-in — leave `ai` unset (or `enabled: false`) and none of it runs. The rest
of EdgeCMS (content modeling, roles, media, deployment) needs no AI configuration at all.
