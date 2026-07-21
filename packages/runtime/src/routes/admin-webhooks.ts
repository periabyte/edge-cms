import { Hono } from "hono";
import { z } from "zod";
import { EdgeCMSError } from "@edgecms/core";
import { requirePermission, requireAuth, type AuthEnv } from "../auth/middleware.js";
import { csrfProtection } from "../auth/csrf.js";
import { WEBHOOK_EVENTS, WebhookStore, stripSecret } from "../webhooks/webhook-store.js";

const eventEnum = z.enum(WEBHOOK_EVENTS);
const createSchema = z.object({
  url: z.string().url().startsWith("https://", "webhook URLs must be https"),
  events: z.array(eventEnum).min(1),
  active: z.boolean().optional(),
});
const updateSchema = z
  .object({
    url: z.string().url().startsWith("https://", "webhook URLs must be https"),
    events: z.array(eventEnum).min(1),
    active: z.boolean(),
  })
  .partial();

/** Admin-only management of outbound webhooks. Secrets are shown once on create/rotate. */
export function adminWebhookRoutes() {
  const app = new Hono<AuthEnv>();
  app.use("*", requireAuth(), csrfProtection, requirePermission("manage", "webhooks"));

  app.get("/", async (c) => {
    const webhooks = (await new WebhookStore(c.env.DB).list()).map(stripSecret);
    return c.json({ webhooks });
  });

  app.post("/", async (c) => {
    const body = createSchema.parse(await c.req.json());
    const created = await new WebhookStore(c.env.DB).create(body);
    // Secret returned exactly once, alongside the public record.
    return c.json({ webhook: stripSecret(created), secret: created.secret }, 201);
  });

  app.patch("/:id", async (c) => {
    const body = updateSchema.parse(await c.req.json());
    const updated = await new WebhookStore(c.env.DB).update(c.req.param("id"), body);
    if (!updated) throw new EdgeCMSError("not_found", `Webhook ${c.req.param("id")} not found`);
    return c.json({ webhook: stripSecret(updated) });
  });

  app.post("/:id/rotate-secret", async (c) => {
    const secret = await new WebhookStore(c.env.DB).rotateSecret(c.req.param("id"));
    if (!secret) throw new EdgeCMSError("not_found", `Webhook ${c.req.param("id")} not found`);
    return c.json({ secret });
  });

  app.delete("/:id", async (c) => {
    const ok = await new WebhookStore(c.env.DB).delete(c.req.param("id"));
    if (!ok) throw new EdgeCMSError("not_found", `Webhook ${c.req.param("id")} not found`);
    return c.body(null, 204);
  });

  return app;
}
