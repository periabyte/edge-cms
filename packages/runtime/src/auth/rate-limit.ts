import type { MiddlewareHandler } from "hono";
import { EdgeCMSError } from "@edgecms/core";

interface RateLimitEnv {
  Bindings: { SESSIONS: KVNamespace };
}

export interface RateLimitOptions {
  /** Max requests per IP within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Namespaces the counter key so different routes don't share a budget. */
  bucket: string;
}

/**
 * Per-IP fixed-window rate limit backed by the SESSIONS KV. Best-effort: KV is
 * eventually consistent, so this bounds abuse rather than enforcing an exact
 * quota. Throws `rate_limited` (429) when exceeded.
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler<RateLimitEnv> {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `rl:${opts.bucket}:${ip}:${window}`;
    const current = Number((await c.env.SESSIONS.get(key)) ?? "0");
    if (current >= opts.limit)
      throw new EdgeCMSError("rate_limited", "Too many requests — please try again later");
    // TTL a little beyond the window so the counter expires on its own.
    await c.env.SESSIONS.put(key, String(current + 1), { expirationTtl: opts.windowSeconds + 5 });
    await next();
  };
}
