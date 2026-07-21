import { describe, expect, it, vi } from "vitest";
import { defineConfig, collection, field, resolveConfig } from "@edgecms/config";
import type { AIProvider, DatabaseAdapter, Doc, Page } from "@edgecms/core";
import { SearchService, extractSearchText } from "../src/ai/search-service.js";
import type { SearchIndex, SearchMatch, SearchVector } from "../src/ai/search-index.js";

function config() {
  return resolveConfig(
    defineConfig({
      name: "t",
      ai: { enabled: true, features: ["semantic-search"] },
      collections: [
        collection("posts", {
          fields: {
            title: field.text({ required: true }),
            slug: field.slug({ from: "title" }),
            body: field.richText(),
          },
        }),
      ],
    }),
  );
}

/** Deterministic 2-D "embeddings": a lookup keyed by a substring of the text. */
function fakeAI(map: Record<string, [number, number]>): AIProvider {
  return {
    altText: async () => "",
    improve: async (t) => t,
    summarize: async (t) => t,
    seo: async (t) => ({ title: t.slice(0, 60), description: t.slice(0, 155) }),
    translate: async (t) => t,
    embed: async (texts) =>
      texts.map((t) => {
        const key = Object.keys(map).find((k) => t.toLowerCase().includes(k));
        return key ? map[key]! : [0, 0];
      }),
  };
}

/** In-memory vector index ranking by dot product, honoring the published filter. */
function memIndex(): SearchIndex & { store: Map<string, SearchVector> } {
  const store = new Map<string, SearchVector>();
  return {
    store,
    async upsert(vectors) {
      for (const v of vectors) store.set(v.id, v);
    },
    async deleteByIds(ids) {
      for (const id of ids) store.delete(id);
    },
    async query(vector, opts): Promise<SearchMatch[]> {
      const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
      return [...store.values()]
        .filter((v) => {
          for (const [k, val] of Object.entries(opts.filter ?? {})) if (v.metadata[k] !== val) return false;
          return true;
        })
        .map((v) => ({ id: v.id, score: dot(vector, v.values), metadata: v.metadata }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.topK);
    },
  };
}

function fakeAdapter(docs: Doc[]): DatabaseAdapter {
  const byId = new Map(docs.map((d) => [d.id, d]));
  return {
    kind: "relational",
    find: vi.fn(async (): Promise<Page> => ({ docs: [], cursor: null })),
    findOne: async (ref) => byId.get(ref.id ?? "") ?? null,
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    planMigration: vi.fn(),
    applyMigration: vi.fn(),
    transaction: vi.fn(),
  } as unknown as DatabaseAdapter;
}

const pub = (over: Partial<Doc>): Doc => ({
  id: "x",
  title: "",
  published_at: Date.now() - 1000,
  created_at: 1,
  updated_at: 1,
  ...over,
});

describe("extractSearchText", () => {
  it("flattens text, slug, and rich-text prose", () => {
    const c = config().collections[0]!;
    const doc = pub({
      title: "Cloudflare Workers",
      slug: "cf-workers",
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Edge compute" }] }] },
    });
    const text = extractSearchText(doc, c);
    expect(text).toContain("Cloudflare Workers");
    expect(text).toContain("cf-workers");
    expect(text).toContain("Edge compute");
  });
});

describe("SearchService semantic mode", () => {
  const ai = fakeAI({ cloud: [1, 0], garden: [0, 1] });

  it("indexes only published documents and removes drafts", async () => {
    const index = memIndex();
    const svc = new SearchService(config(), fakeAdapter([]), ai, index);
    await svc.indexDocument("posts", pub({ id: "1", title: "cloud native" }));
    expect(index.store.has("1")).toBe(true);
    // A draft (no published_at) must be evicted, not indexed.
    await svc.indexDocument("posts", { id: "1", title: "cloud native", published_at: null, created_at: 1, updated_at: 1 });
    expect(index.store.has("1")).toBe(false);
  });

  it("ranks by embedding similarity and returns published docs", async () => {
    const index = memIndex();
    const docs = [pub({ id: "1", title: "cloud things" }), pub({ id: "2", title: "garden things" })];
    const svc = new SearchService(config(), fakeAdapter(docs), ai, index);
    await svc.indexDocument("posts", docs[0]!);
    await svc.indexDocument("posts", docs[1]!);
    const { mode, results } = await svc.search({ q: "cloud servers", limit: 10 });
    expect(mode).toBe("semantic");
    expect(results[0]!.doc.id).toBe("1");
  });

  it("drops results whose backing doc is no longer published", async () => {
    const index = memIndex();
    const svc = new SearchService(config(), fakeAdapter([]), ai, index); // adapter returns null
    await svc.indexDocument("posts", pub({ id: "9", title: "cloud gone" }));
    const { results } = await svc.search({ q: "cloud", limit: 10 });
    expect(results).toEqual([]);
  });
});

describe("SearchService fallback mode", () => {
  it("uses a contains scan when no AI/index is configured", async () => {
    const find = vi.fn(async () => ({ docs: [pub({ id: "1", title: "hello" })], cursor: null }));
    const adapter = { ...fakeAdapter([]), find } as unknown as DatabaseAdapter;
    const svc = new SearchService(config(), adapter, null, null);
    const { mode, results } = await svc.search({ q: "hel", limit: 10 });
    expect(mode).toBe("fallback");
    expect(results[0]!.doc.id).toBe("1");
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "posts", where: expect.objectContaining({ title: { contains: "hel" } }) }),
    );
  });
});
