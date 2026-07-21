import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@edgecms/adapter-d1";
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
});

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const post = (path: string, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: authHeaders(auth), body: JSON.stringify(body) });
const patch = (path: string, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "PATCH", headers: authHeaders(auth), body: JSON.stringify(body) });
const get = (path: string) => SELF.fetch(`https://x${path}`, { headers: { cookie: auth.cookie } });

describe("version history", () => {
  it("records a version on create, on each update, and on publish", async () => {
    const created = await json(await post("/admin/api/posts", { title: "Versioned", slug: "versioned" }));
    const id = (created.doc as { id: string }).id;

    let versions = (await json(await get(`/admin/api/posts/${id}/versions`))).versions as { status: string }[];
    expect(versions).toHaveLength(1);
    expect(versions[0]!.status).toBe("draft");

    await patch(`/admin/api/posts/${id}`, { title: "Versioned v2" });
    await patch(`/admin/api/posts/${id}`, { published_at: Date.now() - 1000 });

    versions = (await json(await get(`/admin/api/posts/${id}/versions`))).versions as { status: string }[];
    expect(versions).toHaveLength(3);
    // Newest first: the publish is the most recent version and is "published".
    expect(versions[0]!.status).toBe("published");
  });

  it("restores an old version, reverting fields and appending a new version", async () => {
    const created = await json(await post("/admin/api/posts", { title: "Original title", slug: "restore-me" }));
    const id = (created.doc as { id: string }).id;
    const firstVersionId = (
      (await json(await get(`/admin/api/posts/${id}/versions`))).versions as { id: string }[]
    )[0]!.id;

    await patch(`/admin/api/posts/${id}`, { title: "Changed title" });
    expect(((await json(await get(`/admin/api/posts/${id}`))).doc as { title: string }).title).toBe("Changed title");

    const restored = await json(
      await post(`/admin/api/posts/${id}/versions/${firstVersionId}/restore`, {}),
    );
    expect((restored.doc as { title: string }).title).toBe("Original title");

    // Restore is append-only: create(1) + update(1) + restore(1) = 3 versions.
    const versions = (await json(await get(`/admin/api/posts/${id}/versions`))).versions as unknown[];
    expect(versions).toHaveLength(3);
  });

  it("404s a version that doesn't belong to the document", async () => {
    const a = await json(await post("/admin/api/posts", { title: "Doc A", slug: "doc-a" }));
    const b = await json(await post("/admin/api/posts", { title: "Doc B", slug: "doc-b" }));
    const aId = (a.doc as { id: string }).id;
    const bId = (b.doc as { id: string }).id;
    const bVersionId = ((await json(await get(`/admin/api/posts/${bId}/versions`))).versions as { id: string }[])[0]!.id;

    const res = await post(`/admin/api/posts/${aId}/versions/${bVersionId}/restore`, {});
    expect(res.status).toBe(404);
  });
});
