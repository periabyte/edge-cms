# EdgeCMS — design system

> Make it real. Free. · Content with an edge.

EdgeCMS is a free, open-source, self-hosted content platform. The whole product promise is **one command self-hosting for a solo dev or aspiring builder** — no budget, no vendor lock-in, no monthly bill to publish. The brand's north star: *"You don't need a big budget — just a big enough blade."*

This is a reference copy (fetched from the Claude Design project at
`claude.ai/design/p/543958ff-a0fc-4c4b-83f5-bc76604ad704`, itself authored from `docs/design-handoff.md`)
of the EdgeCMS design system: tokens, brand, reusable React component specimens, and full-screen UI-kit
recreations. It exists so token values are diffable and versioned in-repo. It is **not** built or
imported directly by any package — each surface (`packages/admin`, `docs-site`, `packages/runtime`)
translates these tokens into its own native format (HSL triplets, Starlight `--sl-*` vars, inline CSS).

## Sources
This system was built **from a written brand brief only** (`docs/design-handoff.md`) — no codebase,
Figma file, or slide deck was provided. All values (palette, type, spacing, components) are original,
authored to the brief.

**The logo is the "edge mark"** — the blade/edge-node glyph shipped at **`assets/logo.svg`**. **Always
use it.** The **primary logo is the signal-orange edge mark** (`assets/logo.svg`); a **teal variant**
(`assets/logo-teal.svg`) exists only for surfaces where the orange can't sit (e.g. on an orange field).
Every branded surface (headers, footers, favicons, the api-root page, docs, product chrome) leads with
the edge mark; it is the primary brand signature. Pair it with the **wordmark `edgecms`** (JetBrains
Mono, extrabold, `-0.02em`) to its right for the full lockup. The prompt glyph `▍`/`$` (teal) is a
compact *fallback* only — for tight inline contexts (breadcrumbs, dense toolbars) where the mark can't
render at ≥18px; it never replaces the edge mark on a primary surface.

> **Note — logo is the one place orange is not "interactive-only."** Signal orange is otherwise reserved
> for interactive elements; the edge mark is the deliberate exception because it *is* the brand signature.
> Do not read an orange logo as a control.

**Edge-mark rules**
- Do not redraw, rotate, or restyle the mark; use `assets/logo.svg` (or the inline SVG, which reads
  `--signal`/`--signal-hover` so it themes automatically).
- Primary is orange; switch to `logo-teal.svg` only when the mark would sit on an orange/warm field.
  Never recolor it to cyan or a neutral.
- Minimum size 20px; give it clear space equal to the height of the wordmark's cap.
- The mark is evocative, never a literal or named copyrighted character/weapon.

---

## Brand positioning (keep consistent everywhere)
- **Mission / north star:** free, one-command self-hosting for a solo dev or aspiring builder.
  *"You don't need a big budget — just a big enough blade."*
- **Headline:** "Make it real. Free."
- **Tagline:** "Content with an edge."
- **IP guardrail:** the "lone builder with an oversized blade" idea stays abstract. Never reference a
  named/copyrighted character, game, or weapon — not in copy, alt text, or credits.

---

## CONTENT FUNDAMENTALS

**Voice:** confident, technical, a little defiant — the underdog builder's tool. Speaks peer-to-peer
with developers, never markety or corporate. Short declarative sentences. The CLI is the hero, so copy
often reads like a command or a terminal line.

**Person:** address the reader as **you** ("your box", "you own the data"). Refer to the product as
**EdgeCMS** or lowercase `edgecms` in mono/command contexts. Avoid "we" chest-thumping; when used, "we"
is modest ("we kept it to one command").

**Casing:** **sentence case everywhere** — headlines, buttons, nav, labels. No Title Case, no ALL CAPS
prose. The only uppercase is the **mono eyebrow label** with wide tracking (e.g. `// SELF-HOSTED · OPEN
SOURCE`), used sparingly.

**Punctuation & rhythm:** periods inside short headlines are on-brand ("Make it real. Free."). Em dashes
for the aside. Occasional leading `//`, `$`, or `›` to invoke the terminal. Numbers are concrete and true
of the current release (versions, region codes, latencies) — never invented stats.

**Emoji:** **none.** The mono/terminal glyph vocabulary (`$ ▍ › // ✓ →`) plays the role emoji would
elsewhere.

**Examples**
- Headline: *Make it real. Free.*
- Sub: *Free, one-command self-hosting for the solo builder.*
- Button: *Deploy now* · *edge up* · *Copy command*
- Eyebrow: *// content with an edge*
- Empty state: *No deployments yet. Run `npx edgecms init` to make your first one.*
- Error: *Key is invalid.* (short, lowercase-friendly, no blame)

---

## VISUAL FOUNDATIONS

**Overall vibe:** a developer terminal turned into a product surface. Dark by default (CLI-first), warm-
paper light theme as a first-class equal. Sharp, technical, low-ornament. Confidence through restraint.

**Color**
- **Base:** deep indigo-charcoal neutral ramp (`--ink-*`, bg `#0D0E17`). Cool, slightly blue. This is the
  spine of everything.
- **Signal orange `#FF6A3D` (`--accent`)** is the **primary accent** — the brand signature (logo,
  emphasis) *and* every interactive element (buttons, links, active states, focus rings, switches). It
  resolves both `--accent` and `--signal`. If it's orange it's on-brand and usually clickable.
- **Mako-teal `#12B5A8` (`--teal`)** is the **secondary** brand color — "the blade". Used for the
  data/edge story, callouts, diagrams, checks/radios. Deliberately deep and desaturated, not a neon.
- **Cool cyan `#38BDF8` (`--data`)** for data / edge visuals: charts, telemetry, graphs.
- **Semantic:** green success, amber warning, red danger — each with a `-soft` tint.
- Max 1–2 background colors per surface. Light mode uses warm paper tints (`--paper-*`), not pure white.

**Type**
- **Display / headings: JetBrains Mono** (`--font-display` / `--font-heading`) — the CLI is the
  identity. Extrabold (800) for hero display, bold (700) for headings, tight tracking (−0.03 to
  −0.015em).
- **Body / UI: Manrope** (`--font-body`) — a clean grotesque, 400–600. Body default 15px / 1.55.
- **Code & mono labels: JetBrains Mono** (`--font-mono`).
- Type scale is in `tokens/typography.css` (`--text-2xs` 11 → `--text-7xl` 92).

**Spacing & layout:** 4px base unit (`--space-*`). Container widths 640/820/1080/1280. Fixed header,
generous vertical rhythm on marketing, dense grid on app/docs. Content-first, left-aligned reading
columns.

**Backgrounds:** solid indigo-charcoal fields, no photographic imagery required. Optional subtle
**grid / scanline** hairline (`--edge-line`, teal at ~16% alpha) on hero surfaces to evoke a terminal.
**No aggressive gradients** — at most a faint radial glow behind a hero command block. No hand-drawn
illustration; visuals are terminals, code blocks, and data.

**Borders:** crisp **1px** (`--border`), stronger `--border-strong` on inputs/controls. Border-driven
separation is preferred over heavy shadow.

**Corner radii — tight & sharp** (the blade): xs 3 / sm 5 / md 7 / lg 10 / xl 14. Buttons and inputs use
`sm` (5px). Cards use `lg` (10px). Nothing pill-shaped except badges/toggles.

**Shadows:** cool, indigo-tinted, low-spread (`--shadow-xs…lg`). Restrained — most surfaces sit on
borders. **Edge glow** (`--glow-accent`, teal) is reserved for hero/data moments only, never everyday
cards.

**Cards:** `--surface-1` fill, 1px `--border`, `--radius-lg`, `--shadow-xs`. Interactive cards lift 2px
and brighten their border on hover. No colored-left-border-only cards.

**Motion:** snappy and mechanical — short durations (90–360ms), `--ease-standard`/`--ease-out`. **No
bounce, no springy overshoot.** Fades + small translate (2px). Spinners rotate linearly. Respect the
sharp, engineered feel.

**Hover states:** buttons brighten (`brightness(1.08)`); ghost buttons gain a `--surface-2` fill; cards
lift + border-strong. **Press:** 1px downward translate (no scale-shrink). Links shift from `--signal`
to `--signal-hover`.

**Focus:** 2px offset ring in the signal orange (`--focus-shadow`) — interactive = orange.

**Transparency & blur:** used sparingly — modal scrim (`--scrim`) with a light `blur(3px)`, and `-soft`
accent tints (~12–14% alpha) for badges/callouts. Not a glassmorphism system.

**Imagery vibe:** where imagery appears it should read cool and technical — terminal captures, code,
dashboards — not warm lifestyle photography. B&W or teal/cyan-tinted screenshots fit best.

---

## ICONOGRAPHY
- **No proprietary icon set exists.** EdgeCMS uses **[Lucide](https://lucide.dev)** as the sanctioned
  system — its thin 1.75px stroke matches the sharp, technical brand. Matches `lucide-react`, already
  used in `packages/admin`.
- Sizes on the scale **14 / 16 / 18 / 20 / 24**; color `currentColor` by default.
- **Mono glyphs as icons:** the terminal vocabulary — `$`, `▍`, `›`, `//`, `✓`, `→` — is used inline as
  brand iconography (prompts, cursors, list markers). This is intentional and central to the identity.
- **Emoji: never.**

---

## Theming
Dark is the default. Set `data-theme="light"` (or `data-theme="dark"`) on `<html>` **or any subtree** to
switch; `.theme-light` / `.theme-dark` classes work too.

## Files in this reference copy
- `styles.css` — global entry (import-only), as shipped by the DS.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `base.css`, `fonts.css`.
- `assets/` — `logo.svg`, `logo-teal.svg` (the edge mark).
