import { Hono } from "hono";
import { z } from "zod";
import { EdgeCMSError, type AIProvider } from "@kalayaan/core";
import type { AIFeature, ResolvedConfig } from "@kalayaan/config";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";
import { csrfProtection } from "../auth/csrf.js";
import { MediaStore } from "../media/media-store.js";
import type { MediaEnv } from "./media.js";

type AiEnv = AuthEnv & MediaEnv & { Variables: { ai?: AIProvider } };

const altTextSchema = z.union([z.object({ mediaId: z.string().min(1) }), z.object({ url: z.string().url() })]);
const improveSchema = z.object({ text: z.string().min(1), instruction: z.string().optional() });
const textSchema = z.object({ text: z.string().min(1) });
const translateSchema = z.object({ text: z.string().min(1), targetLocale: z.string().min(1), sourceLocale: z.string().optional() });

/**
 * AI-assist endpoints, gated per-feature. When AI is disabled, the feature
 * isn't configured, or no binding is present, routes 404 — so the surface is
 * invisible to the admin (which feature-detects from `schema.ai`).
 */
export function adminAiRoutes(config: ResolvedConfig) {
  const app = new Hono<AiEnv>();
  app.use("*", requireAuth(), csrfProtection);

  const gate = (feature: AIFeature) => (c: { var: { ai?: AIProvider } }): AIProvider => {
    if (!config.ai.enabled || !config.ai.features.includes(feature) || !c.var.ai)
      throw new EdgeCMSError("not_found", "AI feature is not enabled");
    return c.var.ai;
  };

  app.post("/alt-text", async (c) => {
    const ai = gate("alt-text")(c);
    const body = altTextSchema.parse(await c.req.json());
    const bytes = await loadImageBytes(c, body);
    const altText = await ai.altText(bytes);
    return c.json({ altText });
  });

  app.post("/improve", async (c) => {
    const ai = gate("editorial-assist")(c);
    const body = improveSchema.parse(await c.req.json());
    const text = await ai.improve(body.text, body.instruction);
    return c.json({ text });
  });

  app.post("/summarize", async (c) => {
    const ai = gate("editorial-assist")(c);
    const body = textSchema.parse(await c.req.json());
    const text = await ai.summarize(body.text);
    return c.json({ text });
  });

  app.post("/seo", async (c) => {
    const ai = gate("editorial-assist")(c);
    const body = textSchema.parse(await c.req.json());
    const seo = await ai.seo(body.text);
    return c.json(seo);
  });

  app.post("/translate", async (c) => {
    const ai = gate("translate")(c);
    const body = translateSchema.parse(await c.req.json());
    const text = await ai.translate(body.text, body.targetLocale, body.sourceLocale);
    return c.json({ text });
  });

  return app;
}

async function loadImageBytes(
  c: { env: { DB: D1Database }; var: { storage: MediaEnv["Variables"]["storage"] } },
  body: { mediaId: string } | { url: string },
): Promise<ArrayBuffer> {
  if ("url" in body) {
    const res = await fetch(body.url);
    if (!res.ok) throw new EdgeCMSError("not_found", `Could not fetch image at ${body.url}`);
    return res.arrayBuffer();
  }
  const record = await new MediaStore(c.env.DB).findById(body.mediaId);
  if (!record) throw new EdgeCMSError("not_found", `Media ${body.mediaId} not found`);
  const object = await c.var.storage.get(record.key);
  if (!object) throw new EdgeCMSError("not_found", `Object for media ${body.mediaId} not found`);
  return new Response(object.body).arrayBuffer();
}
