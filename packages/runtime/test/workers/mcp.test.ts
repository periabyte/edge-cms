import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { D1Adapter, SYSTEM_TABLE_DDL } from "@edgecms/adapter-d1";
import { ApiKeysStore } from "../../src/auth/api-keys.js";
import { testDiff, testSnapshot } from "../fixture.js";

let readKey: string;
let writeKey: string;
let manageKey: string;

beforeAll(async () => {
  const db = (env as unknown as { DB: D1Database }).DB;
  const snapshot = testSnapshot();
  const adapter = new D1Adapter(db, snapshot);
  await adapter.applyMigration(await adapter.planMigration(testDiff(), snapshot, null));
  for (const sql of SYSTEM_TABLE_DDL) await db.prepare(sql).run();
  const keys = new ApiKeysStore(db);
  readKey = (await keys.create({ name: "read", grants: [{ subjects: "*", actions: ["read"] }] })).rawKey;
  writeKey = (
    await keys.create({ name: "write", grants: [{ subjects: "*", actions: ["read", "create", "update", "publish"] }] })
  ).rawKey;
  manageKey = (
    await keys.create({
      name: "manage",
      grants: [{ subjects: "*", actions: ["read", "create", "update", "publish", "delete"] }],
    })
  ).rawKey;
});

let nextId = 1;
async function rpc(key: string, method: string, params?: unknown) {
  const res = await SELF.fetch("https://x/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, ...(params !== undefined && { params }) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const callText = (body: Record<string, unknown>) =>
  ((body.result as { content: { text: string }[] }).content[0]!.text);

describe("MCP server", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await SELF.fetch("https://x/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(res.status).toBe(401);
  });

  it("initializes and lists tools", async () => {
    const init = await rpc(readKey, "initialize");
    expect((init.body.result as { protocolVersion: string }).protocolVersion).toBe("2024-11-05");
    const list = await rpc(readKey, "tools/list");
    const names = (list.body.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(names).toContain("list_collections");
    expect(names).toContain("create_document");
    expect(names).toContain("delete_document");
  });

  it("runs a read tool with a read-scoped key", async () => {
    const res = await rpc(readKey, "tools/call", { name: "list_collections", arguments: {} });
    const cols = JSON.parse(callText(res.body)) as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("posts");
  });

  it("denies a write tool to a read-only key (permission error)", async () => {
    const res = await rpc(readKey, "tools/call", {
      name: "create_document",
      arguments: { collection: "posts", data: { title: "nope" } },
    });
    expect((res.body.error as { message: string }).message).toMatch(/Not permitted to create "posts"/);
  });

  it("creates, publishes, and finds a document with a write key", async () => {
    const created = await rpc(writeKey, "tools/call", {
      name: "create_document",
      arguments: { collection: "posts", data: { title: "MCP made this" } },
    });
    const id = (JSON.parse(callText(created.body)) as { id: string }).id;
    const published = await rpc(writeKey, "tools/call", {
      name: "publish",
      arguments: { collection: "posts", id },
    });
    expect((JSON.parse(callText(published.body)) as { published_at: number }).published_at).toBeTruthy();

    const search = await rpc(writeKey, "tools/call", { name: "search", arguments: { q: "MCP" } });
    const found = JSON.parse(callText(search.body)) as { results: { doc: { id: string } }[] };
    expect(found.results.some((r) => r.doc.id === id)).toBe(true);
  });

  it("gates delete behind the delete permission", async () => {
    const created = await rpc(writeKey, "tools/call", {
      name: "create_document",
      arguments: { collection: "posts", data: { title: "to delete" } },
    });
    const id = (JSON.parse(callText(created.body)) as { id: string }).id;

    const denied = await rpc(writeKey, "tools/call", {
      name: "delete_document",
      arguments: { collection: "posts", id },
    });
    expect((denied.body.error as { message: string }).message).toMatch(/Not permitted to delete "posts"/);

    const ok = await rpc(manageKey, "tools/call", {
      name: "delete_document",
      arguments: { collection: "posts", id },
    });
    expect(JSON.parse(callText(ok.body))).toEqual({ deleted: true, id });
  });

  it("returns a JSON-RPC error for an unknown method", async () => {
    const res = await rpc(readKey, "bogus/method");
    expect((res.body.error as { code: number }).code).toBe(-32601);
  });
});
