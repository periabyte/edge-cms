import type { AIProvider, DatabaseAdapter, Doc } from "@edgecms/core";
import type { ResolvedCollection, ResolvedConfig } from "@edgecms/config";
import { computeStatus, serializeDoc } from "../status.js";
import { VectorizeSearchIndex, type SearchIndex, type SearchVector, type VectorizeBinding } from "./search-index.js";

export interface SearchResult {
  collection: string;
  score: number;
  doc: Record<string, unknown>;
}

/**
 * Semantic search over published documents. On publish, a document's text is
 * embedded and upserted into the vector index keyed by its id; on unpublish or
 * delete it's removed. Queries embed the search string and rank by cosine
 * similarity. When no vector index / AI provider is available the service
 * degrades to a SQL `contains` (LIKE) scan so search always returns something.
 */
export class SearchService {
  constructor(
    private readonly config: ResolvedConfig,
    private readonly adapter: DatabaseAdapter,
    private readonly ai: AIProvider | null,
    private readonly index: SearchIndex | null,
  ) {}

  get semanticEnabled(): boolean {
    return this.ai !== null && this.index !== null;
  }

  /** Re-index a document after a write: upsert if published, else remove. */
  async indexDocument(collectionName: string, doc: Doc): Promise<void> {
    if (!this.semanticEnabled) return;
    const collection = this.config.collections.find((c) => c.name === collectionName);
    if (!collection) return;
    const published = computeStatus(doc) === "published";
    if (!published) {
      await this.index!.deleteByIds([doc.id]);
      return;
    }
    const text = extractSearchText(doc, collection);
    if (!text.trim()) {
      await this.index!.deleteByIds([doc.id]);
      return;
    }
    const [values] = await this.ai!.embed([text]);
    if (!values) return;
    const vector: SearchVector = {
      id: doc.id,
      values,
      metadata: {
        collection: collectionName,
        entityId: (doc.entity_id as string | undefined) ?? doc.id,
        locale: (doc.locale as string | undefined) ?? null,
        published: true,
      },
    };
    await this.index!.upsert([vector]);
  }

  async removeDocument(id: string): Promise<void> {
    if (!this.semanticEnabled) return;
    await this.index!.deleteByIds([id]);
  }

  /** Run a search, returning published documents ranked by relevance. */
  async search(opts: {
    q: string;
    collection?: string;
    locale?: string;
    limit: number;
  }): Promise<{ results: SearchResult[]; mode: "semantic" | "fallback" }> {
    if (this.semanticEnabled) {
      const results = await this.semanticSearch(opts);
      return { results, mode: "semantic" };
    }
    return { results: await this.fallbackSearch(opts), mode: "fallback" };
  }

  private async semanticSearch(opts: {
    q: string;
    collection?: string;
    locale?: string;
    limit: number;
  }): Promise<SearchResult[]> {
    const [values] = await this.ai!.embed([opts.q]);
    if (!values) return [];
    const filter: Record<string, string | boolean> = { published: true };
    if (opts.collection) filter.collection = opts.collection;
    if (opts.locale) filter.locale = opts.locale;
    // Over-fetch so post-hydration published/visibility filtering still fills the page.
    const matches = await this.index!.query(values, { topK: opts.limit * 2, filter });
    const results: SearchResult[] = [];
    for (const m of matches) {
      if (results.length >= opts.limit) break;
      const collection = m.metadata.collection;
      const doc = await this.adapter.findOne({
        collection,
        id: m.id,
        ...(m.metadata.locale && { locale: m.metadata.locale }),
      });
      if (!doc || !isPublished(doc)) continue;
      results.push({ collection, score: m.score, doc: serializeDoc(doc) });
    }
    return results;
  }

  private async fallbackSearch(opts: {
    q: string;
    collection?: string;
    locale?: string;
    limit: number;
  }): Promise<SearchResult[]> {
    const collections = opts.collection
      ? this.config.collections.filter((c) => c.name === opts.collection)
      : this.config.collections;
    const results: SearchResult[] = [];
    for (const collection of collections) {
      const textField = collection.fields.find((f) =>
        ["text", "slug"].includes((f.def as { type: string }).type),
      );
      if (!textField) continue;
      const page = await this.adapter.find({
        collection: collection.name,
        where: {
          [textField.name]: { contains: opts.q },
          published_at: { ne: null, lte: Date.now() },
        },
        ...(opts.locale && { locale: opts.locale }),
        limit: opts.limit,
      });
      for (const doc of page.docs) {
        results.push({ collection: collection.name, score: 0, doc: serializeDoc(doc) });
      }
    }
    return results.slice(0, opts.limit);
  }
}

/**
 * Build a SearchService from request context. Semantic mode requires the
 * `semantic-search` feature enabled AND both an AI provider and a Vectorize
 * binding present; otherwise the service runs in LIKE-fallback mode.
 */
export function searchServiceFrom(
  config: ResolvedConfig,
  adapter: DatabaseAdapter,
  ai: AIProvider | null | undefined,
  vectorize: VectorizeBinding | undefined,
): SearchService {
  const enabled = config.ai.enabled && config.ai.features.includes("semantic-search");
  const index: SearchIndex | null = enabled && vectorize ? new VectorizeSearchIndex(vectorize) : null;
  return new SearchService(config, adapter, enabled ? (ai ?? null) : null, index);
}

function isPublished(doc: Doc): boolean {
  const at = doc.published_at;
  return at !== null && at !== undefined && (at as number) <= Date.now();
}

/** Flatten a document's searchable text: text/slug/select values + richText prose. */
export function extractSearchText(doc: Doc, collection: ResolvedCollection): string {
  const parts: string[] = [];
  for (const f of collection.fields) {
    const type = (f.def as { type: string }).type;
    const value = doc[f.name];
    if (value == null) continue;
    if (type === "text" || type === "slug" || type === "select") {
      if (typeof value === "string") parts.push(value);
    } else if (type === "richText") {
      parts.push(flattenRichText(value));
    }
  }
  return parts.join("\n").trim();
}

/** Pull text nodes out of a TipTap/ProseMirror-style rich-text JSON tree. */
function flattenRichText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(flattenRichText).join(" ");
  if (typeof node === "object") {
    const n = node as Record<string, unknown>;
    const own = typeof n.text === "string" ? n.text : "";
    const kids = Array.isArray(n.content) ? flattenRichText(n.content) : "";
    return [own, kids].filter(Boolean).join(" ");
  }
  return "";
}
