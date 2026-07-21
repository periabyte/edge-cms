/**
 * The vector-store seam. Runtime provides a Vectorize-backed implementation;
 * tests use an in-memory one. Metadata is filterable so results can be scoped
 * to a collection/locale and to published documents only.
 */
export interface SearchVector {
  id: string;
  values: number[];
  metadata: SearchMetadata;
}

export interface SearchMetadata {
  collection: string;
  entityId: string;
  locale: string | null;
  /** Whether the indexed document was published at index time. */
  published: boolean;
  [key: string]: string | number | boolean | null;
}

export interface SearchMatch {
  id: string;
  score: number;
  metadata: SearchMetadata;
}

export interface SearchIndex {
  upsert(vectors: SearchVector[]): Promise<void>;
  deleteByIds(ids: string[]): Promise<void>;
  query(
    vector: number[],
    opts: { topK: number; filter?: Record<string, string | boolean> },
  ): Promise<SearchMatch[]>;
}

/** Minimal shape of the Cloudflare Vectorize binding we depend on. */
export interface VectorizeBinding {
  upsert(vectors: { id: string; values: number[]; metadata?: Record<string, unknown> }[]): Promise<unknown>;
  deleteByIds(ids: string[]): Promise<unknown>;
  query(
    vector: number[],
    opts: { topK?: number; filter?: Record<string, unknown>; returnMetadata?: boolean | "all" },
  ): Promise<{ matches: { id: string; score: number; metadata?: Record<string, unknown> }[] }>;
}

/** SearchIndex backed by a Cloudflare Vectorize index binding. */
export class VectorizeSearchIndex implements SearchIndex {
  constructor(private readonly index: VectorizeBinding) {}

  async upsert(vectors: SearchVector[]): Promise<void> {
    if (vectors.length === 0) return;
    await this.index.upsert(vectors.map((v) => ({ id: v.id, values: v.values, metadata: v.metadata })));
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.index.deleteByIds(ids);
  }

  async query(
    vector: number[],
    opts: { topK: number; filter?: Record<string, string | boolean> },
  ): Promise<SearchMatch[]> {
    const res = await this.index.query(vector, {
      topK: opts.topK,
      returnMetadata: "all",
      ...(opts.filter && { filter: opts.filter }),
    });
    return res.matches.map((m) => ({
      id: m.id,
      score: m.score,
      metadata: (m.metadata ?? {}) as SearchMetadata,
    }));
  }
}
