import { describe, expect, it } from "vitest";
import { CfClient } from "../../src/cf/client.js";
import { enableEmailRouting, enableEmailSending, findZoneForHostname } from "../../src/cf/email.js";
import { mockFetch, type MockRoute } from "./mock-fetch.js";

const creds = { apiToken: "t", accountId: "acct" };

describe("findZoneForHostname", () => {
  it("returns the zone when the exact hostname is a zone (apex domain)", async () => {
    const routes: MockRoute[] = [
      { method: "GET", path: "/zones", respond: () => ({ result: [{ id: "zone-1", name: "example.com" }] }) },
    ];
    const { fetch } = mockFetch(routes);
    const zone = await findZoneForHostname(new CfClient(creds, fetch), "example.com");
    expect(zone).toEqual({ id: "zone-1", name: "example.com" });
  });

  it("walks up from a subdomain to find the apex zone", async () => {
    const routes: MockRoute[] = [
      {
        method: "GET",
        path: "/zones",
        respond: ({ url }) => {
          if (url.includes("blog.example.com")) return { result: [] };
          return { result: [{ id: "zone-1", name: "example.com" }] };
        },
      },
    ];
    const { fetch, calls } = mockFetch(routes);
    const zone = await findZoneForHostname(new CfClient(creds, fetch), "blog.example.com");
    expect(zone).toEqual({ id: "zone-1", name: "example.com" });
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
  });

  it("returns null when no candidate matches a zone on the account", async () => {
    const { fetch } = mockFetch([{ method: "GET", path: "/zones", respond: () => ({ result: [] }) }]);
    const zone = await findZoneForHostname(new CfClient(creds, fetch), "blog.example.com");
    expect(zone).toBeNull();
  });
});

describe("enableEmailRouting", () => {
  it("POSTs to the zone's email routing enable endpoint", async () => {
    const { fetch, calls } = mockFetch([
      { method: "POST", path: "/zones/zone-1/email/routing/enable", respond: () => ({ result: { enabled: true } }) },
    ]);
    await enableEmailRouting(new CfClient(creds, fetch), "zone-1");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.path).toBe("/zones/zone-1/email/routing/enable");
  });
});

describe("enableEmailSending", () => {
  it("reuses an existing subdomain entry (idempotent)", async () => {
    const routes: MockRoute[] = [
      {
        method: "GET",
        path: "/zones/zone-1/email/sending/subdomains",
        respond: () => ({ result: [{ id: "sub-1", name: "example.com" }] }),
      },
    ];
    const { fetch, calls } = mockFetch(routes);
    const result = await enableEmailSending(new CfClient(creds, fetch), "zone-1", "example.com");
    expect(result).toEqual({ id: "sub-1", name: "example.com" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("POSTs a new subdomain when none exists", async () => {
    const routes: MockRoute[] = [
      { method: "GET", path: "/zones/zone-1/email/sending/subdomains", respond: () => ({ result: [] }) },
      {
        method: "POST",
        path: "/zones/zone-1/email/sending/subdomains",
        respond: ({ body }) => ({ result: { id: "sub-2", name: (body as { name: string }).name } }),
      },
    ];
    const { fetch, calls } = mockFetch(routes);
    const result = await enableEmailSending(new CfClient(creds, fetch), "zone-1", "example.com");
    expect(result).toEqual({ id: "sub-2", name: "example.com" });
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ name: "example.com" });
  });
});
