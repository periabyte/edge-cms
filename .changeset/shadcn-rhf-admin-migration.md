---
"@edgecms/admin": patch
---

Migrate the admin UI's hand-written component system to shadcn/ui (Radix-backed primitives under
`src/components/ui/*`) and all forms to react-hook-form + zod. No user-facing behavior changes;
overlays (command palette, confirm dialogs, popovers, media picker, dropdowns, tabs) gain real focus
traps, portals, and keyboard/ARIA handling, and every form gets typed client-side validation. Design
tokens are unchanged in name/values, just re-expressed as HSL channel triplets so Tailwind opacity
modifiers work with the new components.
