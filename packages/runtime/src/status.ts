import type { Doc, Page } from "@edgecms/core";

/**
 * Publish status is *derived*, never stored — the single source of truth is
 * `published_at` (the same column the public content API filters on). Attaching
 * a computed `status` at the route boundary keeps the admin and content APIs in
 * lockstep without a second column that could drift.
 *
 *   - draft:     published_at is null/absent
 *   - scheduled: published_at is a future timestamp
 *   - published: published_at is now or in the past
 */
export type DocStatus = "draft" | "published" | "scheduled";

export function computeStatus(
  doc: { published_at?: unknown; [key: string]: unknown },
  now: number = Date.now(),
): DocStatus {
  const p = doc.published_at;
  if (p === null || p === undefined) return "draft";
  return (p as number) > now ? "scheduled" : "published";
}

/**
 * Returns a shallow copy of the doc with the computed publish state attached
 * under `publishStatus`. A dedicated key (not `status`) is deliberate: `status`
 * is a legitimate user-definable content field (e.g. a select), so overwriting
 * it would corrupt document data. The admin reads `publishStatus` for its
 * publish badge and treats any `status` field as ordinary content.
 */
export function serializeDoc<T extends Doc>(doc: T, now: number = Date.now()): T & { publishStatus: DocStatus } {
  return { ...doc, publishStatus: computeStatus(doc, now) };
}

/** Attaches the computed publish state to every doc in a page. */
export function serializePage(page: Page, now: number = Date.now()): Page {
  return { ...page, docs: page.docs.map((d) => serializeDoc(d, now)) };
}
