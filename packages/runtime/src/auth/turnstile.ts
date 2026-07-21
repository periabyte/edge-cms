import type { MiddlewareHandler } from "hono";
import { EdgeCMSError } from "@edgecms/core";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileEnv {
  Bindings: { TURNSTILE_SECRET?: string };
}

/**
 * Verify a Cloudflare Turnstile token before a public write. The client sends
 * the token as the `cf-turnstile-response` header or a `cf-turnstile-response`
 * body field. When no `TURNSTILE_SECRET` is configured the endpoint is treated
 * as disabled (403) — public submissions require Turnstile by design.
 */
export function turnstileProtection(): MiddlewareHandler<TurnstileEnv> {
  return async (c, next) => {
    const secret = c.env.TURNSTILE_SECRET;
    if (!secret) throw new EdgeCMSError("forbidden", "Submissions are not enabled (Turnstile is not configured)");

    const token = await readToken(c);
    if (!token) throw new EdgeCMSError("forbidden", "Missing Turnstile token");

    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    const ip = c.req.header("cf-connecting-ip");
    if (ip) form.append("remoteip", ip);

    const res = await fetch(SITEVERIFY_URL, { method: "POST", body: form }).catch(() => null);
    const ok = res ? (((await res.json().catch(() => null)) as { success?: boolean } | null)?.success ?? false) : false;
    if (!ok) throw new EdgeCMSError("forbidden", "Turnstile verification failed");
    await next();
  };
}

async function readToken(c: import("hono").Context<TurnstileEnv>): Promise<string | null> {
  const header = c.req.header("cf-turnstile-response");
  if (header) return header;
  // Fall back to a body field without consuming the JSON body the handler needs:
  // only parse form bodies here; JSON submitters must use the header.
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("form")) {
    const body = await c.req.parseBody();
    const field = body["cf-turnstile-response"];
    return typeof field === "string" ? field : null;
  }
  return null;
}
