import { Hono } from "hono";
import { z } from "zod";
import { EdgeCMSError, ulid } from "@edgecms/core";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";
import { csrfProtection } from "../auth/csrf.js";

const createSchema = z.object({
  collection: z.string().min(1),
  name: z.string().min(1).max(120),
  query: z.record(z.string(), z.unknown()),
});
const updateSchema = z.object({ name: z.string().min(1).max(120), query: z.record(z.string(), z.unknown()) }).partial();

interface SavedFilter {
  id: string;
  collection: string;
  name: string;
  query: unknown;
  createdAt: number;
}

interface Row {
  id: string;
  user_id: string;
  collection: string;
  name: string;
  query_json: string;
  created_at: number;
}

function fromRow(row: Row): SavedFilter {
  return { id: row.id, collection: row.collection, name: row.name, query: JSON.parse(row.query_json), createdAt: row.created_at };
}

/**
 * Personal saved filters for the collection browser. Scoped to the acting
 * user — API keys have no user identity, so they're rejected (these are UI
 * preferences, not content). One user can never see or mutate another's.
 */
export function adminSavedFilterRoutes() {
  const app = new Hono<AuthEnv>();
  app.use("*", requireAuth(), csrfProtection);

  function userId(c: { var: { actor: AuthEnv["Variables"]["actor"] } }): string {
    if (c.var.actor.type !== "user")
      throw new EdgeCMSError("forbidden", "Saved filters are per-user and unavailable to API keys");
    return c.var.actor.id;
  }

  app.get("/", async (c) => {
    const uid = userId(c);
    const collection = c.req.query("collection");
    const stmt = collection
      ? c.env.DB.prepare(
          `SELECT * FROM "saved_filters" WHERE "user_id" = ? AND "collection" = ? ORDER BY "created_at" DESC`,
        ).bind(uid, collection)
      : c.env.DB.prepare(`SELECT * FROM "saved_filters" WHERE "user_id" = ? ORDER BY "created_at" DESC`).bind(uid);
    const { results } = await stmt.all<Row>();
    return c.json({ filters: results.map(fromRow) });
  });

  app.post("/", async (c) => {
    const uid = userId(c);
    const body = createSchema.parse(await c.req.json());
    const id = ulid();
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO "saved_filters" ("id","user_id","collection","name","query_json","created_at") VALUES (?,?,?,?,?,?)`,
    )
      .bind(id, uid, body.collection, body.name, JSON.stringify(body.query), now)
      .run();
    return c.json({ filter: { id, collection: body.collection, name: body.name, query: body.query, createdAt: now } }, 201);
  });

  app.patch("/:id", async (c) => {
    const uid = userId(c);
    const body = updateSchema.parse(await c.req.json());
    const existing = await c.env.DB.prepare(`SELECT * FROM "saved_filters" WHERE "id" = ? AND "user_id" = ?`)
      .bind(c.req.param("id"), uid)
      .first<Row>();
    if (!existing) throw new EdgeCMSError("not_found", `Saved filter ${c.req.param("id")} not found`);
    const next = fromRow(existing);
    if (body.name !== undefined) next.name = body.name;
    if (body.query !== undefined) next.query = body.query;
    await c.env.DB.prepare(`UPDATE "saved_filters" SET "name" = ?, "query_json" = ? WHERE "id" = ? AND "user_id" = ?`)
      .bind(next.name, JSON.stringify(next.query), next.id, uid)
      .run();
    return c.json({ filter: next });
  });

  app.delete("/:id", async (c) => {
    const uid = userId(c);
    const existing = await c.env.DB.prepare(`SELECT "id" FROM "saved_filters" WHERE "id" = ? AND "user_id" = ?`)
      .bind(c.req.param("id"), uid)
      .first<{ id: string }>();
    if (!existing) throw new EdgeCMSError("not_found", `Saved filter ${c.req.param("id")} not found`);
    await c.env.DB.prepare(`DELETE FROM "saved_filters" WHERE "id" = ? AND "user_id" = ?`).bind(c.req.param("id"), uid).run();
    return c.body(null, 204);
  });

  return app;
}
