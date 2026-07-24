---
"@kalayaan/admin": patch
---

Publish `@kalayaan/admin` to npm instead of keeping it `private`.

`kalayaan`/`@kalayaan/cli` resolves `@kalayaan/admin`'s built `dist/` at runtime
(`admin-assets.ts`'s `require.resolve("@kalayaan/admin/package.json")`) to serve the
admin SPA in `dev`/`deploy`. Marking it `private` meant it never actually got published,
so a real `npm install kalayaan` outside this monorepo 404'd on `@kalayaan/admin` — the
CLI was unusable for anyone who wasn't already inside the workspace with `workspace:*`
symlinks. Also added `"files": ["dist"]` to match every other published package's
convention.
