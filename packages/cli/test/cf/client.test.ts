import { describe, expect, it, vi } from "vitest";
import { CfApiError, CfClient, credentialsFromEnv } from "../../src/cf/client.js";
import { mockFetch } from "./mock-fetch.js";

const creds = { apiToken: "tok", accountId: "acct" };

describe("CfClient", () => {
  it("sends a bearer token and returns the unwrapped result on success", async () => {
    const { fetch, calls } = mockFetch([
      { method: "GET", path: "/accounts/acct/thing", respond: () => ({ result: { ok: true } }) },
    ]);
    const client = new CfClient(creds, fetch);
    const result = await client.request("GET", "/accounts/acct/thing");
    expect(result).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ method: "GET", path: "/accounts/acct/thing" });
  });

  it("throws CfApiError with the API's error messages on success:false", async () => {
    const { fetch } = mockFetch([
      {
        method: "GET",
        path: "/accounts/acct/bad",
        respond: () => ({ success: false, status: 400 }),
      },
    ]);
    const client = new CfClient(creds, fetch);
    await expect(client.request("GET", "/accounts/acct/bad")).rejects.toThrow(CfApiError);
  });

  it("retries on 429/5xx and succeeds once the transient error clears", async () => {
    let attempts = 0;
    const fetch = vi.fn(async () => {
      attempts++;
      if (attempts < 3) return new Response("", { status: 503 });
      return new Response(JSON.stringify({ success: true, result: { ok: true }, errors: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;

    const client = new CfClient(creds, fetch);
    const result = await client.request("GET", "/accounts/acct/flaky");
    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(3);
  });

  it("sends JSON bodies with a content-type header", async () => {
    const { fetch, calls } = mockFetch([
      { method: "POST", path: "/accounts/acct/thing", respond: () => ({ result: {} }) },
    ]);
    const client = new CfClient(creds, fetch);
    await client.request("POST", "/accounts/acct/thing", { body: { name: "x" } });
    expect(calls[0]?.body).toEqual({ name: "x" });
  });
});

describe("credentialsFromEnv", () => {
  it("returns null when either variable is missing", () => {
    expect(credentialsFromEnv({})).toBeNull();
    expect(credentialsFromEnv({ EDGE_API_TOKEN: "t" })).toBeNull();
  });

  it("returns credentials when both are set", () => {
    expect(credentialsFromEnv({ EDGE_API_TOKEN: "t", EDGE_ACCOUNT_ID: "a" })).toEqual({
      apiToken: "t",
      accountId: "a",
    });
  });
});
