import { Hono } from "hono";
import { EdgeCMSError, type AIProvider } from "@edgecms/core";
import type { ResolvedConfig } from "@edgecms/config";
import { MAX_LIMIT } from "@edgecms/core";
import { searchServiceFrom } from "../ai/search-service.js";
import type { VectorizeBinding } from "../ai/search-index.js";
import type { ContentEnv } from "./content.js";

type SearchEnv = ContentEnv & { Bindings: { VECTORIZE?: VectorizeBinding }; Variables: { ai?: AIProvider } };

/**
 * Public semantic search: `GET /api/v1/search?q=…&collection=…&locale=…&limit=…`.
 * Returns published documents ranked by relevance. Falls back to a SQL
 * `contains` scan when Vectorize/AI aren't configured, so the endpoint always
 * works — the `mode` field tells the client which path ran.
 */
export function searchRoutes(config: ResolvedConfig) {
  const app = new Hono<SearchEnv>();

  app.get("/", async (c) => {
    const q = c.req.query("q");
    if (!q || !q.trim()) throw new EdgeCMSError("bad_request", "search requires a non-empty `q`");
    const collection = c.req.query("collection");
    if (collection && !config.collections.some((x) => x.name === collection))
      throw new EdgeCMSError("not_found", `Unknown collection "${collection}"`);
    const locale = c.req.query("locale");
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 20) || 20, 1), MAX_LIMIT);

    const service = searchServiceFrom(config, c.var.adapter, c.var.ai, c.env.VECTORIZE);
    const { results, mode } = await service.search({
      q: q.trim(),
      ...(collection && { collection }),
      ...(locale && { locale }),
      limit,
    });
    return c.json({ query: q.trim(), mode, results });
  });

  return app;
}
