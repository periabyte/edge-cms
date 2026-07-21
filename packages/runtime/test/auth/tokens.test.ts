import { describe, expect, it } from "vitest";
import { hmacSign, hmacVerify, randomToken, sha256Hex } from "../../src/auth/tokens.js";

describe("randomToken", () => {
  it("is URL-safe and unique across calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => randomToken()));
    expect(tokens.size).toBe(20);
    for (const t of tokens) expect(t).not.toMatch(/[+/=]/);
  });
});

describe("hmac sign/verify", () => {
  it("verifies a signature made with the same secret", async () => {
    const sig = await hmacSign("secret1", "value");
    expect(await hmacVerify("secret1", "value", sig)).toBe(true);
  });

  it("rejects a signature made with a different secret", async () => {
    const sig = await hmacSign("secret1", "value");
    expect(await hmacVerify("secret2", "value", sig)).toBe(false);
  });

  it("rejects a tampered value", async () => {
    const sig = await hmacSign("secret1", "value");
    expect(await hmacVerify("secret1", "tampered", sig)).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("is deterministic", async () => {
    expect(await sha256Hex("hello")).toBe(await sha256Hex("hello"));
  });

  it("differs for different input", async () => {
    expect(await sha256Hex("hello")).not.toBe(await sha256Hex("world"));
  });
});
