import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@edgecms/adapter-d1";
import { UsersStore } from "../../src/auth/users-store.js";
import { testDiff, testSnapshot } from "../fixture.js";
import { authenticate, authHeaders, loginAs, type AuthedRequest } from "./auth-helper.js";

let auth: AuthedRequest;

beforeAll(async () => {
  const db = (env as unknown as { DB: D1Database }).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  await adapter.applyMigration(await adapter.planMigration(testDiff(), snapshot, null));
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  auth = await authenticate();
});

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const post = (path: string, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: authHeaders(auth), body: JSON.stringify(body) });
const get = (path: string) => SELF.fetch(`https://x${path}`, { headers: { cookie: auth.cookie } });

describe("saved filters", () => {
  it("round-trips create → list → delete scoped to a collection", async () => {
    const created = await json(
      await post("/admin/api/saved-filters", {
        collection: "posts",
        name: "My drafts",
        query: { status: "draft", sort: "-updated_at" },
      }),
    );
    const id = (created.filter as { id: string }).id;
    expect((created.filter as { query: { status: string } }).query.status).toBe("draft");

    const list = (await json(await get("/admin/api/saved-filters?collection=posts"))).filters as unknown[];
    expect(list).toHaveLength(1);

    // A different collection sees none of it.
    const other = (await json(await get("/admin/api/saved-filters?collection=authors"))).filters as unknown[];
    expect(other).toHaveLength(0);

    const del = await SELF.fetch(`https://x/admin/api/saved-filters/${id}`, {
      method: "DELETE",
      headers: authHeaders(auth),
    });
    expect(del.status).toBe(204);
  });

  it("isolates filters between users", async () => {
    // Owner (default user) creates a filter.
    const created = await json(
      await post("/admin/api/saved-filters", { collection: "posts", name: "Owner only", query: {} }),
    );
    const id = (created.filter as { id: string }).id;

    // A second user logs in and must not see or delete the first user's filter.
    await new UsersStore((env as unknown as { DB: D1Database }).DB).create(
      "second@example.com",
      "anotherlongpassword",
      "editor",
    );
    const other = await loginAs("second@example.com", "anotherlongpassword");
    const otherList = (await json(
      await SELF.fetch("https://x/admin/api/saved-filters?collection=posts", { headers: { cookie: other.cookie } }),
    )).filters as unknown[];
    expect(otherList.some((f) => (f as { id: string }).id === id)).toBe(false);

    const del = await SELF.fetch(`https://x/admin/api/saved-filters/${id}`, {
      method: "DELETE",
      headers: { cookie: other.cookie, "x-csrf-token": other.csrfToken },
    });
    expect(del.status).toBe(404); // can't touch another user's filter
  });
});
