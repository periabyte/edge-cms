const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

/**
 * ULID: 48-bit timestamp + 80 random bits, lexicographically sortable by
 * creation time. Uses WebCrypto so it runs in workerd, Node, and browsers.
 */
export function ulid(now: number = Date.now()): string {
  let ts = now;
  const time = new Array<string>(10);
  for (let i = 9; i >= 0; i--) {
    time[i] = ALPHABET[ts % 32]!;
    ts = Math.floor(ts / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i]! % 32];
  return time.join("") + rand;
}
