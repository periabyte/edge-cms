import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { R2Adapter } from "../../src/adapter.js";

interface TestEnv {
  BUCKET: R2Bucket;
}

function adapter() {
  return new R2Adapter((env as unknown as TestEnv).BUCKET);
}

describe("R2Adapter", () => {
  it("round-trips a put/get with content type and size", async () => {
    const a = adapter();
    const body = new TextEncoder().encode("hello world").buffer;
    const put = await a.put("uploads/hello.txt", body, "text/plain");
    expect(put).toEqual({ key: "uploads/hello.txt", size: 11, contentType: "text/plain" });

    const got = await a.get("uploads/hello.txt");
    expect(got).not.toBeNull();
    expect(got!.contentType).toBe("text/plain");
    expect(got!.size).toBe(11);
    const text = await new Response(got!.body).text();
    expect(text).toBe("hello world");
  });

  it("returns null for a missing key", async () => {
    expect(await adapter().get("nope")).toBeNull();
  });

  it("deletes an object", async () => {
    const a = adapter();
    await a.put("to-delete.txt", new TextEncoder().encode("x").buffer, "text/plain");
    await a.delete("to-delete.txt");
    expect(await a.get("to-delete.txt")).toBeNull();
  });

  it("delete is a no-op for a missing key", async () => {
    await expect(adapter().delete("never-existed.txt")).resolves.toBeUndefined();
  });
});
