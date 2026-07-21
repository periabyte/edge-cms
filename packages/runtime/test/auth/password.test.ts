import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("salts each hash independently, so identical passwords hash differently", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "not-a-valid-hash")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$notanumber$aa$bb")).toBe(false);
  });

  it("keeps PBKDF2 iterations within Cloudflare's 100k cap (higher throws NotSupportedError on deployed Workers)", async () => {
    const hash = await hashPassword("anything");
    const iterations = Number(hash.split("$")[1]);
    expect(iterations).toBeLessThanOrEqual(100_000);
  });
});
