import { hmacSign, hmacVerify } from "./tokens.js";

/**
 * Signed, stateless invite tokens: `base64url(JSON{uid,exp}) . hmac`. No storage
 * table is needed — single-use is enforced at the call site by only accepting an
 * invite while the user's password is still unset (see the accept-invite route),
 * so a consumed token can't be replayed.
 */

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface InvitePayload {
  uid: string;
  exp: number;
}

export async function createInviteToken(
  userId: string,
  secret: string,
  now: number = Date.now(),
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string> {
  const payload: InvitePayload = { uid: userId, exp: now + ttlMs };
  const encoded = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacSign(secret, encoded);
  return `${encoded}.${sig}`;
}

/** Verify signature + expiry. Returns the userId, or null if invalid/expired. */
export async function verifyInviteToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await hmacVerify(secret, encoded, sig))) return null;
  let payload: InvitePayload;
  try {
    payload = JSON.parse(b64urlDecode(encoded)) as InvitePayload;
  } catch {
    return null;
  }
  if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
  if (now > payload.exp) return null;
  return payload.uid;
}

function b64urlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64urlDecode(value: string): string {
  const b64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
