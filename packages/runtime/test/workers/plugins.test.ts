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
});

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

describe("plugin lifecycle", () => {
  it("runs beforeChange on create (see worker.ts test plugin)", async () => {
    const res = await SELF.fetch("https://x/admin/api/posts", {
      method: "POST",
      headers: authHeaders(auth),
      body: JSON.stringify({ title: "hook-me" }),
    });
    expect(res.status).toBe(201);
    const doc = (await json(res)).doc as { title: string };
    expect(doc.title).toBe("hooked!");
  });

  it("leaves other writes untouched", async () => {
    const res = await SELF.fetch("https://x/admin/api/posts", {
      method: "POST",
      headers: authHeaders(auth),
      body: JSON.stringify({ title: "ordinary post" }),
    });
    const doc = (await json(res)).doc as { title: string };
    expect(doc.title).toBe("ordinary post");
  });
});
