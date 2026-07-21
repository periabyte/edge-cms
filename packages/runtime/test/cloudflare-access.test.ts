import { beforeAll, describe, expect, it } from "vitest";
import { verifyAccessJwt } from "../src/auth/cloudflare-access.js";

const TEAM = "https://acme.cloudflareaccess.com";
const AUD = "app-aud-tag";

let signingKey: CryptoKey;
let jwk: Record<string, unknown>;

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const header = { alg: "RS256", typ: "JWT", kid: "test-kid" };
  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  signingKey = pair.privateKey;
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Record<string, unknown>;
  jwk = { kid: "test-kid", kty: pub.kty, n: pub.n, e: pub.e, alg: "RS256" };
});

const opts = () => ({ aud: AUD, teamDomain: TEAM, fetchJwks: async () => [jwk] as never });
const now = Math.floor(Date.now() / 1000);

describe("verifyAccessJwt", () => {
  it("accepts a valid token and returns the identity", async () => {
    const token = await signJwt({ aud: AUD, iss: TEAM, exp: now + 60, email: "Ada@Example.com", sub: "u1" });
    const id = await verifyAccessJwt(token, opts());
    expect(id).toEqual({ email: "ada@example.com", sub: "u1" });
  });

  it("rejects an expired token", async () => {
    const token = await signJwt({ aud: AUD, iss: TEAM, exp: now - 10, email: "a@b.com" });
    await expect(verifyAccessJwt(token, opts())).rejects.toThrow(/expired/);
  });

  it("rejects an audience mismatch", async () => {
    const token = await signJwt({ aud: "other-app", iss: TEAM, exp: now + 60, email: "a@b.com" });
    await expect(verifyAccessJwt(token, opts())).rejects.toThrow(/audience/);
  });

  it("rejects an issuer mismatch", async () => {
    const token = await signJwt({ aud: AUD, iss: "https://evil.example", exp: now + 60, email: "a@b.com" });
    await expect(verifyAccessJwt(token, opts())).rejects.toThrow(/issuer/);
  });

  it("rejects a tampered signature", async () => {
    const token = await signJwt({ aud: AUD, iss: TEAM, exp: now + 60, email: "a@b.com" });
    const tampered = token.slice(0, -4) + "AAAA";
    await expect(verifyAccessJwt(tampered, opts())).rejects.toThrow(/signature/);
  });

  it("rejects a token whose payload was swapped (signature no longer matches)", async () => {
    const token = await signJwt({ aud: AUD, iss: TEAM, exp: now + 60, email: "a@b.com" });
    const forgedPayload = b64urlJson({ aud: AUD, iss: TEAM, exp: now + 60, email: "attacker@b.com" });
    const [h, , s] = token.split(".");
    await expect(verifyAccessJwt(`${h}.${forgedPayload}.${s}`, opts())).rejects.toThrow(/signature/);
  });
});
