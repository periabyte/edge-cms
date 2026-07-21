import { Hono } from "hono";
import { EdgeCMSError, PluginHost, type AIProvider } from "@edgecms/core";
import type { ResolvedConfig } from "@edgecms/config";
import { publicAuth, assertPermission, type AuthEnv } from "../auth/middleware.js";
import { turnstileProtection } from "../auth/turnstile.js";
import { rateLimit } from "../auth/rate-limit.js";
import { collectionWriteSchema } from "../validation.js";
import { serializeDoc } from "../status.js";
import { createDocument } from "../content/create-document.js";
import type { VectorizeBinding } from "../ai/search-index.js";
import type { ContentEnv } from "./content.js";

type SubmitEnv = ContentEnv &
  AuthEnv & { Bindings: { VECTORIZE?: VectorizeBinding }; Variables: { ai?: AIProvider } };

/**
 * Public, anonymous content submission: `POST /api/v1/:collection`. Guarded by
 * Turnstile + per-IP rate limiting, authorized against the `public` role's
 * `create` grant (opt-in per collection), and forced to land as an unpublished
 * draft for an editor to moderate. Reuses the same create pipeline as the admin
 * API (`createDocument`).
 */
export function submissionRoutes(config: ResolvedConfig, plugins: PluginHost = new PluginHost()) {
  const app = new Hono<SubmitEnv>();
  const byName = new Map(config.collections.map((c) => [c.name, c]));

  app.post(
    "/:collection",
    publicAuth(),
    turnstileProtection(),
    rateLimit({ limit: 5, windowSeconds: 60, bucket: "submit" }),
    async (c) => {
      const name = c.req.param("collection");
      const collection = byName.get(name);
      // Authorize against the anonymous ability; 404 (not 403) so a private
      // collection's existence isn't revealed.
      if (!collection || !c.var.actor.ability.can("create", name))
        throw new EdgeCMSError("not_found", `Unknown collection "${name}"`);
      assertPermission(c, "create", name);

      const parsed = collectionWriteSchema(collection, { partial: false }).parse(await c.req.json());
      // Submissions are always drafts — anonymous users can never self-publish.
      if ("published_at" in parsed)
        throw new EdgeCMSError("forbidden", "Submissions cannot set a publish date");

      const doc = await createDocument(c, { config, plugins }, {
        collection,
        data: parsed,
        actor: { type: "anonymous", id: null },
      });
      return c.json({ doc: serializeDoc(doc) }, 201);
    },
  );

  return app;
}
