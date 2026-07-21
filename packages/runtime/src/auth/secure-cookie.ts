import type { Context } from "hono";

/**
 * Whether auth cookies should carry the `Secure` attribute. True on any HTTPS
 * request (all deployed Cloudflare traffic), false over plain HTTP — otherwise
 * browsers silently drop `Secure` cookies during local `wrangler dev` on a LAN
 * IP (localhost is exempt, a bare IP is not), which breaks login from other
 * devices. Honours `x-forwarded-proto` for proxied setups.
 */
export function secureCookies(c: Context): boolean {
  const forwarded = c.req.header("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]!.trim() === "https";
  return new URL(c.req.url).protocol === "https:";
}
