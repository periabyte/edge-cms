import { describe, expect, it, vi } from "vitest";
import { CfClient } from "../src/cf/client.js";
import { ensureHyperdrive, parseDatabaseUrl } from "../src/cf/hyperdrive.js";

function clientWith(handler: (method: string, path: string, body: unknown) => unknown): CfClient {
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace("https://api.cloudflare.com/client/v4", "");
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const result = handler(init.method as string, path, body);
    return new Response(JSON.stringify({ success: true, result, errors: [] }), { status: 200 });
  });
  return new CfClient({ apiToken: "t", accountId: "acc" }, fetchImpl as unknown as typeof fetch);
}

describe("parseDatabaseUrl", () => {
  it("parses a postgres URL with default port", () => {
    expect(parseDatabaseUrl("postgres://u:p@db.example.com/appdb")).toEqual({
      scheme: "postgres",
      host: "db.example.com",
      port: 5432,
      database: "appdb",
      user: "u",
      password: "p",
    });
  });

  it("parses a mysql URL with an explicit port and encoded password", () => {
    expect(parseDatabaseUrl("mysql://root:p%40ss@127.0.0.1:3307/shop")).toEqual({
      scheme: "mysql",
      host: "127.0.0.1",
      port: 3307,
      database: "shop",
      user: "root",
      password: "p@ss",
    });
  });

  it("rejects unsupported schemes and missing database", () => {
    expect(() => parseDatabaseUrl("mongodb://h/db")).toThrow(/Unsupported/);
    expect(() => parseDatabaseUrl("postgres://u@h/")).toThrow(/database name/);
  });
});

describe("ensureHyperdrive", () => {
  const origin = parseDatabaseUrl("postgres://u:p@h/db");

  it("creates a new config when none matches the name", async () => {
    const calls: { method: string; path: string }[] = [];
    const client = clientWith((method, path) => {
      calls.push({ method, path });
      if (method === "GET") return [];
      return { id: "hd-new", name: "my-hd" };
    });
    expect(await ensureHyperdrive(client, "my-hd", origin)).toEqual({ id: "hd-new" });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
  });

  it("patches an existing config instead of creating a duplicate", async () => {
    const calls: { method: string; path: string }[] = [];
    const client = clientWith((method, path) => {
      calls.push({ method, path });
      if (method === "GET") return [{ id: "hd-1", name: "my-hd" }];
      return { id: "hd-1", name: "my-hd" };
    });
    expect(await ensureHyperdrive(client, "my-hd", origin)).toEqual({ id: "hd-1" });
    expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH"]);
    expect(calls[1]!.path).toContain("/hyperdrive/configs/hd-1");
  });
});
