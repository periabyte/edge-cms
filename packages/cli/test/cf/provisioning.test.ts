import { describe, expect, it } from "vitest";
import { CfClient } from "../../src/cf/client.js";
import { ensureD1Database, executeRemoteSql } from "../../src/cf/d1.js";
import { ensureR2Bucket, ensureR2Cors } from "../../src/cf/r2.js";
import { ensureKvNamespace } from "../../src/cf/kv.js";
import { mockFetch } from "./mock-fetch.js";

const creds = { apiToken: "tok", accountId: "acct" };

describe("ensureD1Database", () => {
  it("reuses an existing database with the same name instead of creating a duplicate", async () => {
    const { fetch, calls } = mockFetch([
      {
        method: "GET",
        path: "/accounts/acct/d1/database",
        respond: () => ({ result: [{ uuid: "existing-id", name: "my-site-db" }] }),
      },
    ]);
    const db = await ensureD1Database(new CfClient(creds, fetch), "my-site-db");
    expect(db).toEqual({ id: "existing-id", name: "my-site-db" });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("creates a new database when none exists with that name", async () => {
    const { fetch, calls } = mockFetch([
      { method: "GET", path: "/accounts/acct/d1/database", respond: () => ({ result: [] }) },
      {
        method: "POST",
        path: "/accounts/acct/d1/database",
        respond: () => ({ result: { uuid: "new-id", name: "my-site-db" } }),
      },
    ]);
    const db = await ensureD1Database(new CfClient(creds, fetch), "my-site-db");
    expect(db).toEqual({ id: "new-id", name: "my-site-db" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ name: "my-site-db" });
  });
});

describe("executeRemoteSql", () => {
  it("runs each statement as a separate request (no cross-statement transaction on D1's HTTP API)", async () => {
    const { fetch, calls } = mockFetch([
      {
        method: "POST",
        path: "/accounts/acct/d1/database/db1/query",
        respond: () => ({ result: [{ results: [], success: true, meta: { duration: 1 } }] }),
      },
    ]);
    await executeRemoteSql(new CfClient(creds, fetch), "db1", ["CREATE TABLE a (id TEXT)", "CREATE TABLE b (id TEXT)"]);
    const queryCalls = calls.filter((c) => c.path.endsWith("/query"));
    expect(queryCalls).toHaveLength(2);
    expect(queryCalls[0]?.body).toEqual({ sql: "CREATE TABLE a (id TEXT)" });
  });
});

describe("ensureR2Bucket", () => {
  it("reuses an existing bucket by name", async () => {
    const { fetch, calls } = mockFetch([
      {
        method: "GET",
        path: "/accounts/acct/r2/buckets",
        respond: () => ({ result: { buckets: [{ name: "my-site-media" }] } }),
      },
    ]);
    await ensureR2Bucket(new CfClient(creds, fetch), "my-site-media");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("creates a bucket when missing", async () => {
    const { fetch, calls } = mockFetch([
      { method: "GET", path: "/accounts/acct/r2/buckets", respond: () => ({ result: { buckets: [] } }) },
      { method: "POST", path: "/accounts/acct/r2/buckets", respond: () => ({ result: {} }) },
    ]);
    await ensureR2Bucket(new CfClient(creds, fetch), "my-site-media");
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ name: "my-site-media" });
  });

  it("sets permissive GET/PUT CORS for the Worker-proxied upload path", async () => {
    const { fetch, calls } = mockFetch([
      { method: "PUT", path: "/accounts/acct/r2/buckets/b1/cors", respond: () => ({ result: {} }) },
    ]);
    await ensureR2Cors(new CfClient(creds, fetch), "b1");
    const body = calls[0]?.body as { rules: { allowed: { methods: string[] } }[] };
    expect(body.rules[0]!.allowed.methods).toEqual(["GET", "PUT"]);
  });
});

describe("ensureKvNamespace", () => {
  it("reuses an existing namespace by title", async () => {
    const { fetch } = mockFetch([
      {
        method: "GET",
        path: "/accounts/acct/storage/kv/namespaces",
        respond: () => ({ result: [{ id: "kv-id", title: "my-site-sessions" }] }),
      },
    ]);
    const id = await ensureKvNamespace(new CfClient(creds, fetch), "my-site-sessions");
    expect(id).toBe("kv-id");
  });

  it("creates a namespace when missing", async () => {
    const { fetch, calls } = mockFetch([
      { method: "GET", path: "/accounts/acct/storage/kv/namespaces", respond: () => ({ result: [] }) },
      {
        method: "POST",
        path: "/accounts/acct/storage/kv/namespaces",
        respond: () => ({ result: { id: "new-kv-id", title: "my-site-sessions" } }),
      },
    ]);
    const id = await ensureKvNamespace(new CfClient(creds, fetch), "my-site-sessions");
    expect(id).toBe("new-kv-id");
  });
});
