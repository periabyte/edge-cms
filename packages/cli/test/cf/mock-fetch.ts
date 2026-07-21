import { vi } from "vitest";

export interface MockRoute {
  method: string;
  /** Matched against the request path (everything after /client/v4). */
  path: RegExp | string;
  respond: (req: { url: string; body: unknown }) => { status?: number; result?: unknown; success?: boolean };
}

/** Builds a fetch() replacement that dispatches to route handlers, recording every call. */
export function mockFetch(routes: MockRoute[]) {
  const calls: { method: string; path: string; body: unknown; authorization?: string; query: string }[] = [];

  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/client\/v4/, "");
    const rawBody = init?.body;
    const isForm = typeof FormData !== "undefined" && rawBody instanceof FormData;
    const body = isForm ? "[FormData]" : rawBody ? (JSON.parse(rawBody as string) as unknown) : undefined;
    const authorization = new Headers(init?.headers).get("authorization") ?? undefined;
    calls.push({ method, path, body, authorization, query: parsed.search });

    const route = routes.find(
      (r) => r.method === method && (typeof r.path === "string" ? r.path === path : r.path.test(path)),
    );
    if (!route) throw new Error(`No mock route for ${method} ${path}`);

    const { status = 200, result = null, success = true } = route.respond({ url: path, body });
    return new Response(JSON.stringify({ success, result, errors: success ? [] : [{ code: 1, message: "mock error" }] }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });

  return { fetch: fn as unknown as typeof fetch, calls };
}
