import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@edgecms/adapter-d1";
import { testDiff, testSnapshot } from "../fixture.js";
import { authenticate, authHeaders, type AuthedRequest } from "./auth-helper.js";

interface TestEnv {
  DB: D1Database;
}

let auth: AuthedRequest;

beforeAll(async () => {
  const db = (env as unknown as TestEnv).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  const plan = await adapter.planMigration(testDiff(), snapshot, null);
  await adapter.applyMigration(plan);
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  auth = await authenticate();
});

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

function upload(filename: string, contentType: string, bytes: Uint8Array) {
  return SELF.fetch("https://x/admin/api/media", {
    method: "PUT",
    headers: { ...authHeaders(auth), "content-type": contentType, "x-filename": filename },
    body: bytes,
  });
}

describe("media", () => {
  it("rejects an upload without credentials", async () => {
    const res = await SELF.fetch("https://x/admin/api/media", {
      method: "PUT",
      headers: { "content-type": "text/plain", "x-filename": "x.txt" },
      body: new TextEncoder().encode("x"),
    });
    expect(res.status).toBe(401);
  });

  it("uploads, serves publicly with cache headers, lists, and deletes", async () => {
    const bytes = new TextEncoder().encode("hello media");
    const uploaded = await upload("hello.txt", "text/plain", bytes);
    expect(uploaded.status).toBe(201);
    const { doc } = await json(uploaded);
    const media = doc as { id: string; filename: string; size: number; mime: string };
    expect(media.filename).toBe("hello.txt");
    expect(media.size).toBe(bytes.byteLength);
    expect(media.mime).toBe("text/plain");

    const served = await SELF.fetch(`https://x/media/${media.id}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("text/plain");
    expect(served.headers.get("cache-control")).toContain("immutable");
    expect(await served.text()).toBe("hello media");

    const list = await json(
      await SELF.fetch("https://x/admin/api/media", { headers: { cookie: auth.cookie } }),
    );
    expect((list.docs as { id: string }[]).some((d) => d.id === media.id)).toBe(true);

    const del = await SELF.fetch(`https://x/admin/api/media/${media.id}`, {
      method: "DELETE",
      headers: authHeaders(auth),
    });
    expect(del.status).toBe(204);
    expect((await SELF.fetch(`https://x/media/${media.id}`)).status).toBe(404);
  });

  it("rejects an upload missing required headers", async () => {
    const noContentType = await SELF.fetch("https://x/admin/api/media", {
      method: "PUT",
      headers: { ...authHeaders(auth), "x-filename": "x.txt" },
      body: new TextEncoder().encode("x"),
    });
    expect(noContentType.status).toBe(400);

    const noFilename = await SELF.fetch("https://x/admin/api/media", {
      method: "PUT",
      headers: { ...authHeaders(auth), "content-type": "text/plain" },
      body: new TextEncoder().encode("x"),
    });
    expect(noFilename.status).toBe(400);
  });

  it("rejects an empty upload body", async () => {
    const res = await upload("empty.txt", "text/plain", new Uint8Array());
    expect(res.status).toBe(400);
  });

  it("404s a media id that was never uploaded", async () => {
    const res = await SELF.fetch("https://x/media/nonexistent-id");
    expect(res.status).toBe(404);
  });
});
