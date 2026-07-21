/**
 * URL-safe slug from a title. Mirrors @edgecms/core's slugify so the admin's
 * live preview matches what the server generates on save (the admin only deps
 * @edgecms/config, so this is a small local copy rather than a new dep).
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
