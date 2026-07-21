import { SELF } from "cloudflare:test";

function cookieHeader(setCookieHeaders: string[]): string {
  return setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
}

export interface AuthedRequest {
  cookie: string;
  csrfToken: string;
}

/** Completes first-run setup (or logs in, since setup only runs once) and returns auth headers. */
export async function authenticate(
  email = "owner@example.com",
  password = "supersecretpassword",
): Promise<AuthedRequest> {
  let res = await SELF.fetch("https://x/admin/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 403) {
    res = await SELF.fetch("https://x/admin/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
  const body = (await res.json()) as { csrfToken: string };
  return { cookie: cookieHeader(res.headers.getSetCookie()), csrfToken: body.csrfToken };
}

/** Logs in an already-registered user (no setup fallback) and returns their auth headers. */
export async function loginAs(email: string, password: string): Promise<AuthedRequest> {
  const res = await SELF.fetch("https://x/admin/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { csrfToken: string };
  return { cookie: cookieHeader(res.headers.getSetCookie()), csrfToken: body.csrfToken };
}

/** Auth headers to spread into a fetch() init for an authenticated, CSRF-safe admin mutation. */
export function authHeaders(auth: AuthedRequest): Record<string, string> {
  return { cookie: auth.cookie, "x-csrf-token": auth.csrfToken };
}
