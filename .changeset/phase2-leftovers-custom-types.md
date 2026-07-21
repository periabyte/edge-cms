---
"@edgecms/config": minor
"@edgecms/core": minor
"@edgecms/runtime": minor
"@edgecms/adapter-relational": minor
"@edgecms/adapter-d1": minor
"@edgecms/adapter-postgres": minor
"@edgecms/adapter-mysql": minor
"@edgecms/admin": minor
"@edgecms/cli": minor
"edgecms": minor
---

Close the Phase-2 editorial leftovers and wire plugin custom field types end-to-end.

**Custom field types (plugin) — now a working, end-to-end flow.** A new `custom`
field type (`field.custom("<typeName>", { control, options })`) can be authored in
config, is stored as JSON text (like `richText`) across every dialect, and is
validated on write by the plugin's registered `fieldTypes[typeName]` validator —
the previously dead `PluginHost.fieldTypes()` link. `/admin/api/schema` advertises
the registered type names via `features.customFieldTypes`, and the admin renders a
custom field with a built-in widget chosen by its `control` hint (text / textarea /
number / select / boolean / json). Projects register plugins via a new optional
`cms.plugins.ts` (default-exports a `Plugin[]`); the CLI bundles it and the
generated Worker entry passes it to `createApp`.

_Note:_ because the admin is a prebuilt static bundle, custom fields render through
declarative `control` hints, not injectable React components.

**MT-review write path.** Admin writes accept `?review=mt`, which records the
resulting `_versions` row with status `mt-review` — so the "Needs review" badge and
filter now light with real data. The editor's Translate action persists the target
locale with this intent.

**True per-locale editing.** `GET /admin/api/:collection/:id?locale=` resolves a
locale's own row (a sibling sharing `entity_id`), returning `null` when the variant
doesn't exist yet. The editor's Locales panel is now a switcher: pick a locale to
load/edit its document, or start a fresh draft that saves as a linked variant and
publishes independently.

**AI assist — Summarize + SEO.** `AIProvider` gains `summarize` and `seo`; two new
routes (`/admin/api/ai/summarize`, `/admin/api/ai/seo`) and editor actions sit under
the existing `editorial-assist` feature gate. _Breaking:_ `AIProvider` implementers
must add the two methods.
