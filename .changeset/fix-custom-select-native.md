---
"@kalayaan/admin": patch
---

Fix a plugin-contributed custom field type with `control: "select"` still rendering the
native `<select>` (`registry.tsx`'s `CustomFieldEditor`) instead of the shadcn/Radix
`Select` already used everywhere else in the admin UI. The built-in `field.select()` type
was already correct — only the custom-field-type variant had the leftover.
