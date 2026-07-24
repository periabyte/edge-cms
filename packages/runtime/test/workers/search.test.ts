import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@kalayaan/adapter-d1";
import { testDiff, testSnapshot } from "../fixture.js";
import { authenticate, authHeaders, type AuthedRequest } from "./auth-helper.js";

let auth: AuthedRequest;

beforeAll(async () => {
  const db = (env as unknown as { DB: D1Database }).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  await adapter.applyMigration(await adapter.planMigration(testDiff(), snapshot, null));
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  auth = await authenticate();

  // A published and a draft post, so search must return only the published one.
  const mk = (title: string, publish: boolean) =>
    SELF.fetch("https://x/admin/api/posts", {
      method: "POST",
      headers: authHeaders(auth),
      body: JSON.stringify({ title, ...(publish && { published_at: Date.now() - 1000 }) }),
    });
  await mk("Cloudflare Workers guide", true);
  await mk("Secret draft about Workers", false);
});

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

/**
 * The test fixture doesn't enable semantic-search, so /api/v1/search runs the
 * LIKE fallback against real D1 — proving the endpoint works with no Vectorize.
 */
describe("GET /api/v1/search (fallback mode)", () => {
  it("requires a non-empty q", async () => {
    const res = await SELF.fetch("https://x/api/v1/search");
    expect(res.status).toBe(400);
  });

  it("returns only published matches in fallback mode", async () => {
    const res = await SELF.fetch("https://x/api/v1/search?q=Workers");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.mode).toBe("fallback");
    const results = body.results as { doc: { title: string } }[];
    expect(results.length).toBe(1);
    expect(results[0]!.doc.title).toBe("Cloudflare Workers guide");
  });

  it("404s an unknown collection filter", async () => {
    const res = await SELF.fetch("https://x/api/v1/search?q=x&collection=nope");
    expect(res.status).toBe(404);
  });

  it("does not shadow the /:collection content route", async () => {
    // "search" must resolve to the search route, not be treated as a collection.
    const res = await SELF.fetch("https://x/api/v1/posts");
    expect(res.status).toBe(200);
  });
});
