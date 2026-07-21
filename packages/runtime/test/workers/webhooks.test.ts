import { env, SELF } from "cloudflare:test";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => vi.restoreAllMocks());

const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const post = (path: string, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "POST", headers: authHeaders(auth), body: JSON.stringify(body) });
const patch = (path: string, body: unknown) =>
  SELF.fetch(`https://x${path}`, { method: "PATCH", headers: authHeaders(auth), body: JSON.stringify(body) });
const get = (path: string) => SELF.fetch(`https://x${path}`, { headers: { cookie: auth.cookie } });

describe("webhooks", () => {
  it("creates a webhook, returns the secret once, and never leaks it on list", async () => {
    const created = await json(
      await post("/admin/api/webhooks", {
        url: "https://example.com/hook",
        events: ["document.published"],
      }),
    );
    expect(typeof created.secret).toBe("string");
    expect(created.webhook).not.toHaveProperty("secret");

    const list = (await json(await get("/admin/api/webhooks"))).webhooks as Record<string, unknown>[];
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]).not.toHaveProperty("secret");
  });

  it("rejects a non-https URL", async () => {
    const res = await post("/admin/api/webhooks", { url: "http://insecure.example", events: ["document.updated"] });
    expect(res.status).toBe(422);
  });

  it("dispatches a signed request on publish to subscribed hooks only", async () => {
    // Subscribe one hook to publish, another only to deletes.
    await post("/admin/api/webhooks", { url: "https://pub.example/hook", events: ["document.published"] });
    await post("/admin/api/webhooks", { url: "https://del.example/hook", events: ["document.deleted"] });

    // Mock the return so delivery doesn't attempt a real (failing) DNS lookup.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const created = await json(await post("/admin/api/posts", { title: "Hook Me", slug: "hook-me" }));
    const id = (created.doc as { id: string }).id;
    await patch(`/admin/api/posts/${id}`, { published_at: Date.now() - 1000 });

    // waitUntil delivery may be async; give microtasks a chance to flush.
    await vi.waitFor(() => {
      const publishCall = fetchSpy.mock.calls.find(([u]) => String(u) === "https://pub.example/hook");
      expect(publishCall).toBeDefined();
    });

    const publishCall = fetchSpy.mock.calls.find(([u]) => String(u) === "https://pub.example/hook")!;
    const init = publishCall[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("x-edgecms-event")).toBe("document.published");
    expect(headers.get("x-edgecms-signature")).toMatch(/^sha256=/);
    // The delete-only hook must not receive the publish event.
    expect(fetchSpy.mock.calls.some(([u]) => String(u) === "https://del.example/hook")).toBe(false);
  });

  it("requires authentication to manage webhooks", async () => {
    const res = await SELF.fetch("https://x/admin/api/webhooks", { method: "GET" });
    expect(res.status).toBe(401);
  });
});
