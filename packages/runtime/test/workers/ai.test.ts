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
const post = (path: string, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: authHeaders(auth), body: JSON.stringify(body) });

// 1×1 red PNG.
const PNG_1x1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("AI routes", () => {
  it("improves text when editorial-assist is enabled", async () => {
    const res = await post("/admin/api/ai/improve", { text: "helo wrld" });
    expect(res.status).toBe(200);
    expect((await json(res)).text).toContain("improved:helo wrld");
  });

  it("summarizes text under the editorial-assist gate", async () => {
    const res = await post("/admin/api/ai/summarize", { text: "a long piece of prose" });
    expect(res.status).toBe(200);
    expect((await json(res)).text).toContain("improved:a long piece of prose");
  });

  it("returns SEO metadata (title + description) under the editorial-assist gate", async () => {
    const res = await post("/admin/api/ai/seo", { text: "content about widgets" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(typeof body.title).toBe("string");
    expect(typeof body.description).toBe("string");
  });

  it("404s translate because that feature is not enabled in the fixture", async () => {
    const res = await post("/admin/api/ai/translate", { text: "hello", targetLocale: "es" });
    expect(res.status).toBe(404);
  });

  it("generates alt text for an uploaded image via mediaId", async () => {
    const upload = await SELF.fetch("https://x/admin/api/media", {
      method: "PUT",
      headers: { ...authHeaders(auth), "content-type": "image/png", "x-filename": "dot.png" },
      body: PNG_1x1,
    });
    const mediaId = ((await json(upload)).doc as { id: string }).id;

    const res = await post("/admin/api/ai/alt-text", { mediaId });
    expect(res.status).toBe(200);
    expect((await json(res)).altText).toBe("a mocked alt text description");
  });

  it("sniffs image dimensions on upload", async () => {
    const upload = await SELF.fetch("https://x/admin/api/media", {
      method: "PUT",
      headers: { ...authHeaders(auth), "content-type": "image/png", "x-filename": "dot2.png" },
      body: PNG_1x1,
    });
    const doc = (await json(upload)).doc as { width: number | null; height: number | null };
    expect(doc.width).toBe(1);
    expect(doc.height).toBe(1);
  });
});
