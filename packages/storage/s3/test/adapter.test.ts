import { describe, expect, it } from "vitest";
import { S3Adapter, type SignedFetch } from "../src/adapter.js";

/** Records requests and replays a queue of canned responses. */
function recorder(responses: Response[]): { fetch: SignedFetch; calls: Request[] } {
  const calls: Request[] = [];
  let i = 0;
  return {
    calls,
    fetch: async (req) => {
      calls.push(req);
      return responses[i++] ?? new Response(null, { status: 200 });
    },
  };
}

function adapter(fetch: SignedFetch, forcePathStyle = true) {
  return new S3Adapter({ bucket: "media", endpoint: "https://s3.example.com", forcePathStyle, signedFetch: fetch });
}

describe("S3Adapter", () => {
  it("PUTs to a path-style URL with content-type and length", async () => {
    const rec = recorder([new Response(null, { status: 200 })]);
    const bytes = new TextEncoder().encode("hello").buffer;
    const obj = await adapter(rec.fetch).put("images/a.png", bytes, "image/png");
    expect(obj).toEqual({ key: "images/a.png", size: 5, contentType: "image/png" });
    const req = rec.calls[0]!;
    expect(req.method).toBe("PUT");
    expect(req.url).toBe("https://s3.example.com/media/images/a.png");
    expect(req.headers.get("content-type")).toBe("image/png");
    expect(req.headers.get("content-length")).toBe("5");
  });

  it("uses virtual-host URLs when path-style is off", async () => {
    const rec = recorder([new Response(null, { status: 200 })]);
    await adapter(rec.fetch, false).put("a.png", new ArrayBuffer(1), "image/png");
    expect(rec.calls[0]!.url).toBe("https://media.s3.example.com/a.png");
  });

  it("GET returns the stream, content-type, and size", async () => {
    const body = new Response("data").body!;
    const rec = recorder([
      new Response(body, { status: 200, headers: { "content-type": "image/png", "content-length": "4" } }),
    ]);
    const got = await adapter(rec.fetch).get("a.png");
    expect(got?.contentType).toBe("image/png");
    expect(got?.size).toBe(4);
    expect(rec.calls[0]!.method).toBe("GET");
  });

  it("GET returns null on 404", async () => {
    const rec = recorder([new Response(null, { status: 404 })]);
    expect(await adapter(rec.fetch).get("missing.png")).toBeNull();
  });

  it("DELETE tolerates 404 (idempotent) but throws on 500", async () => {
    const ok = recorder([new Response(null, { status: 404 })]);
    await expect(adapter(ok.fetch).delete("gone.png")).resolves.toBeUndefined();
    const bad = recorder([new Response("boom", { status: 500 })]);
    await expect(adapter(bad.fetch).delete("x.png")).rejects.toThrow(/500/);
  });

  it("percent-encodes key segments", async () => {
    const rec = recorder([new Response(null, { status: 200 })]);
    await adapter(rec.fetch).put("a b/c+d.png", new ArrayBuffer(0), "image/png");
    expect(rec.calls[0]!.url).toBe("https://s3.example.com/media/a%20b/c%2Bd.png");
  });

  it("throws with the response body on a failed PUT", async () => {
    const rec = recorder([new Response("AccessDenied", { status: 403 })]);
    await expect(adapter(rec.fetch).put("a.png", new ArrayBuffer(1), "image/png")).rejects.toThrow(
      /403 AccessDenied/,
    );
  });
});
