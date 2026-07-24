import { Hono } from "hono";
import { z } from "zod";
import type { AIProvider, StorageAdapter } from "@kalayaan/core";
import { EdgeCMSError } from "@kalayaan/core";
import type { ResolvedConfig } from "@kalayaan/config";
import { requireAuth, requirePermission, type AuthEnv } from "../auth/middleware.js";
import { csrfProtection } from "../auth/csrf.js";
import { MediaStore } from "../media/media-store.js";
import { imageDimensions } from "../media/dimensions.js";
import type { WaitUntilCtx } from "../webhooks/dispatch.js";

export interface MediaEnv {
  Variables: { storage: StorageAdapter; ai?: AIProvider };
}

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB — see plan §6, Worker-proxied path
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // media keys are content-addressed by ulid; safe to cache hard

/** Authenticated upload/list/delete under /admin/api/media. */
export function adminMediaRoutes(config: ResolvedConfig) {
  const app = new Hono<AuthEnv & MediaEnv>();
  app.use("*", requireAuth(), csrfProtection);
  const altTextEnabled = config.ai.enabled && config.ai.features.includes("alt-text");

  app.get("/", requirePermission("read", "media"), async (c) => {
    const records = await new MediaStore(c.env.DB).list();
    return c.json({ docs: records });
  });

  app.put("/", requirePermission("create", "media"), async (c) => {
    const contentType = c.req.header("content-type");
    const filename = c.req.header("x-filename");
    if (!contentType) throw new EdgeCMSError("bad_request", "Content-Type header is required");
    if (!filename) throw new EdgeCMSError("bad_request", "X-Filename header is required");

    const body = await c.req.arrayBuffer();
    if (body.byteLength === 0) throw new EdgeCMSError("bad_request", "Upload body is empty");
    if (body.byteLength > MAX_UPLOAD_BYTES)
      throw new EdgeCMSError("bad_request", `Upload exceeds the ${MAX_UPLOAD_BYTES} byte limit`);

    const store = new MediaStore(c.env.DB);
    const record = await store.create({ filename, mime: contentType, size: body.byteLength });
    await c.var.storage.put(record.key, body, contentType);

    // Fill dimensions synchronously (cheap header sniff) so the returned record
    // is complete; generate alt text asynchronously so it never blocks upload.
    if (contentType.startsWith("image/")) {
      const dims = imageDimensions(body);
      if (dims) {
        await store.update(record.id, dims);
        record.width = dims.width;
        record.height = dims.height;
      }
      if (altTextEnabled && c.var.ai) {
        const ai = c.var.ai;
        (c.executionCtx as WaitUntilCtx).waitUntil(
          ai
            .altText(body)
            .then((alt) => store.update(record.id, { alt }))
            .catch(() => {}),
        );
      }
    }

    return c.json({ doc: record }, 201);
  });

  const patchSchema = z.object({ alt: z.string().nullable() });

  app.patch("/:id", requirePermission("update", "media"), async (c) => {
    const body = patchSchema.parse(await c.req.json());
    const updated = await new MediaStore(c.env.DB).update(c.req.param("id"), { alt: body.alt });
    if (!updated) throw new EdgeCMSError("not_found", `media/${c.req.param("id")} not found`);
    return c.json({ doc: updated });
  });

  app.delete("/:id", requirePermission("delete", "media"), async (c) => {
    const store = new MediaStore(c.env.DB);
    const deleted = await store.delete(c.req.param("id"));
    if (!deleted) throw new EdgeCMSError("not_found", `media/${c.req.param("id")} not found`);
    await c.var.storage.delete(deleted.key);
    return c.body(null, 204);
  });

  return app;
}

/** Public, cacheable object serving under /media/:id. */
export function publicMediaRoutes() {
  const app = new Hono<AuthEnv & MediaEnv>();

  app.get("/:id", async (c) => {
    const record = await new MediaStore(c.env.DB).findById(c.req.param("id"));
    if (!record) throw new EdgeCMSError("not_found", `media/${c.req.param("id")} not found`);
    const object = await c.var.storage.get(record.key);
    if (!object) throw new EdgeCMSError("not_found", `media/${c.req.param("id")} not found`);
    return new Response(object.body, {
      headers: {
        "content-type": object.contentType,
        "content-length": String(object.size),
        "cache-control": `public, max-age=${MAX_AGE_SECONDS}, immutable`,
      },
    });
  });

  return app;
}
