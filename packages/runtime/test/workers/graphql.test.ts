import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@kalayaan/adapter-d1";
import { testDiff, testSnapshot } from "../fixture.js";
import { authenticate, authHeaders, type AuthedRequest } from "./auth-helper.js";

let auth: AuthedRequest;
let publishedId: string;

beforeAll(async () => {
  const db = (env as unknown as { DB: D1Database }).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  await adapter.applyMigration(await adapter.planMigration(testDiff(), snapshot, null));
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  auth = await authenticate();

  const create = await SELF.fetch("https://x/admin/api/posts", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ title: "GraphQL Post", published_at: Date.now() - 1000, views: 7 }),
  });
  publishedId = ((await create.json()) as { doc: { id: string } }).doc.id;

  await SELF.fetch("https://x/admin/api/posts", {
    method: "POST",
    headers: authHeaders(auth),
    body: JSON.stringify({ title: "Draft Post" }),
  });
});

const gql = (query: string, variables?: Record<string, unknown>) =>
  SELF.fetch("https://x/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, ...(variables && { variables }) }),
  });

const json = async (res: Response) => (await res.json()) as { data?: Record<string, unknown>; errors?: unknown };

describe("GraphQL read API", () => {
  it("resolves a single published document by id (parity with REST)", async () => {
    const res = await gql(`query($id: ID!) { posts_one(id: $id) { id title views published_at } }`, {
      id: publishedId,
    });
    expect(res.status).toBe(200);
    const { data } = await json(res);
    const one = data!.posts_one as { id: string; title: string; views: number };
    expect(one.id).toBe(publishedId);
    expect(one.title).toBe("GraphQL Post");
    expect(one.views).toBe(7);

    // Same doc via REST — fields must agree.
    const rest = (await (await SELF.fetch(`https://x/api/v1/posts/${publishedId}`)).json()) as {
      doc: { title: string; views: number };
    };
    expect(rest.doc.title).toBe(one.title);
    expect(rest.doc.views).toBe(one.views);
  });

  it("lists only published documents", async () => {
    const { data } = await json(await gql(`{ posts { id title } }`));
    const posts = data!.posts as { title: string }[];
    expect(posts.map((p) => p.title)).toEqual(["GraphQL Post"]);
  });

  it("returns null for a draft/unknown id, not the document", async () => {
    const { data } = await json(await gql(`{ posts_one(id: "missing") { id } }`));
    expect(data!.posts_one).toBeNull();
  });

  it("400s a request with no query", async () => {
    const res = await SELF.fetch("https://x/api/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
