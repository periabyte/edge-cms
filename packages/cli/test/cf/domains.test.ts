import { describe, expect, it } from "vitest";
import { CfClient } from "../../src/cf/client.js";
import { attachWorkerCustomDomain, deleteWorkerCustomDomain } from "../../src/cf/domains.js";
import { mockFetch, type MockRoute } from "./mock-fetch.js";

const creds = { apiToken: "t", accountId: "acct" };

describe("attachWorkerCustomDomain", () => {
  it("reuses an existing attachment for the hostname (idempotent)", async () => {
    const routes: MockRoute[] = [
      {
        method: "GET",
        path: "/accounts/acct/workers/domains",
        respond: () => ({ result: [{ id: "dom-1", hostname: "blog.example.com", service: "site" }] }),
      },
    ];
    const { fetch, calls } = mockFetch(routes);
    const client = new CfClient(creds, fetch);
    const result = await attachWorkerCustomDomain(client, { hostname: "blog.example.com", service: "site" });
    expect(result).toEqual({ id: "dom-1", hostname: "blog.example.com" });
    // Only the GET ran — no PUT when it already exists.
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("PUTs a new attachment when none exists (no zone_id — Cloudflare resolves it)", async () => {
    const routes: MockRoute[] = [
      { method: "GET", path: "/accounts/acct/workers/domains", respond: () => ({ result: [] }) },
      {
        method: "PUT",
        path: "/accounts/acct/workers/domains",
        respond: ({ body }) => ({ result: { id: "dom-2", hostname: (body as { hostname: string }).hostname, service: "site" } }),
      },
    ];
    const { fetch, calls } = mockFetch(routes);
    const client = new CfClient(creds, fetch);
    const result = await attachWorkerCustomDomain(client, { hostname: "example.com", service: "site" });
    expect(result).toEqual({ id: "dom-2", hostname: "example.com" });
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body).toEqual({ hostname: "example.com", service: "site", environment: "production" });
  });
});

describe("deleteWorkerCustomDomain", () => {
  it("DELETEs the attachment by id", async () => {
    const { fetch, calls } = mockFetch([
      { method: "DELETE", path: "/accounts/acct/workers/domains/dom-9", respond: () => ({ result: null }) },
    ]);
    await deleteWorkerCustomDomain(new CfClient(creds, fetch), "dom-9");
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.path).toBe("/accounts/acct/workers/domains/dom-9");
  });
});
