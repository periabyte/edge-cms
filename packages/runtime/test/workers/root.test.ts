import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET / (API root page)", () => {
  it("returns a small HTML page for browser navigations, listing config-driven entry points", async () => {
    const res = await SELF.fetch("https://x/", { headers: { accept: "text/html,application/xhtml+xml" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("This is an EdgeCMS API.");
    expect(body).toContain("test-site");
    expect(body).toContain('href="/admin"');
    expect(body).toContain('href="/api/v1"');
    // fixture config has graphql: true
    expect(body).toContain('href="/api/graphql"');
    expect(body).toContain('href="/mcp"');
  });

  it("falls through to the existing JSON 404 for non-HTML clients", async () => {
    const res = await SELF.fetch("https://x/", { headers: { accept: "application/json" } });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("falls through to the JSON 404 when no Accept header is sent", async () => {
    const res = await SELF.fetch("https://x/");
    expect(res.status).toBe(404);
  });
});
