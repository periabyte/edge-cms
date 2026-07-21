import { EdgeCMSError } from "@edgecms/core";

/**
 * Cloudflare Access identity, extracted from a verified JWT. Access has already
 * authenticated the user at the edge; the Worker only needs to trust the token.
 */
export interface AccessIdentity {
  email: string;
  sub: string;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

export interface VerifyAccessOptions {
  /** The Access application AUD tag the token must be issued for. */
  aud: string;
  /** The team domain, e.g. `https://acme.cloudflareaccess.com`. */
  teamDomain: string;
  /** Overridable for tests; defaults to fetching the team's signing keys. */
  fetchJwks?: (teamDomain: string) => Promise<Jwk[]>;
  /** Overridable clock for tests. */
  now?: () => number;
}

const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

async function defaultFetchJwks(teamDomain: string): Promise<Jwk[]> {
  const url = `${teamDomain.replace(/\/+$/, "")}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch Access JWKS: ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  return body.keys ?? [];
}

/**
 * Verify a Cloudflare Access JWT: RS256 signature against the team's JWKS,
 * matching `aud`, issuer equal to the team domain, and time-window claims.
 * Throws EdgeCMSError("unauthorized") on any failure. The JWKS is cached per
 * team domain for an hour.
 */
export async function verifyAccessJwt(
  token: string,
  opts: VerifyAccessOptions,
): Promise<AccessIdentity> {
  const now = opts.now ?? Date.now;
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized("malformed token");
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = decodeJson(headerB64) as { alg?: string; kid?: string };
  if (header.alg !== "RS256") throw unauthorized("unexpected token algorithm");
  const payload = decodeJson(payloadB64) as {
    aud?: string | string[];
    iss?: string;
    exp?: number;
    nbf?: number;
    email?: string;
    sub?: string;
  };

  const key = await resolveKey(opts, header.kid);
  const valid = await verifySignature(key, `${headerB64}.${payloadB64}`, signatureB64);
  if (!valid) throw unauthorized("bad signature");

  const nowSec = Math.floor(now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < nowSec) throw unauthorized("token expired");
  if (typeof payload.nbf === "number" && payload.nbf > nowSec) throw unauthorized("token not yet valid");
  const audience = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audience.includes(opts.aud)) throw unauthorized("audience mismatch");
  if (payload.iss !== opts.teamDomain.replace(/\/+$/, "")) throw unauthorized("issuer mismatch");
  if (!payload.email) throw unauthorized("token has no email");

  return { email: payload.email.toLowerCase(), sub: payload.sub ?? payload.email };
}

async function resolveKey(opts: VerifyAccessOptions, kid: string | undefined): Promise<Jwk> {
  const domain = opts.teamDomain.replace(/\/+$/, "");
  const cached = jwksCache.get(domain);
  const now = opts.now ?? Date.now;
  let keys: Jwk[];
  if (cached && now() - cached.fetchedAt < JWKS_TTL_MS && !opts.fetchJwks) {
    keys = cached.keys;
  } else {
    keys = await (opts.fetchJwks ?? defaultFetchJwks)(domain);
    if (!opts.fetchJwks) jwksCache.set(domain, { keys, fetchedAt: now() });
  }
  const key = keys.find((k) => k.kid === kid) ?? keys[0];
  if (!key) throw unauthorized("no signing key");
  return key;
}

async function verifySignature(jwk: Jwk, signingInput: string, signatureB64: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(signatureB64),
    new TextEncoder().encode(signingInput),
  );
}

function decodeJson(b64url: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(b64url)));
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

function unauthorized(reason: string): EdgeCMSError {
  return new EdgeCMSError("unauthorized", `Cloudflare Access: ${reason}`);
}
