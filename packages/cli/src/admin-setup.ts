/**
 * First-run admin bootstrap. After a fresh deploy, the deployed Worker exposes
 * `POST /admin/api/auth/setup` (public only while zero users exist), which
 * creates the initial admin with the server's own password hashing. We POST to
 * that live endpoint rather than writing to D1 directly so the hash format
 * always matches the runtime.
 */
export interface AdminCredentials {
  email: string;
  password: string;
}

export class AdminSetupError extends Error {}

/**
 * Creates the root admin on a freshly deployed Worker. Retries briefly so a
 * just-enabled workers.dev subdomain that isn't warm yet doesn't fail the call.
 */
export async function bootstrapAdmin(
  baseUrl: string,
  creds: AdminCredentials,
  fetchImpl: typeof fetch = fetch,
  { retries = 4, delayMs = 1500 }: { retries?: number; delayMs?: number } = {},
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/admin/api/auth/setup`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delayMs);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(creds),
      });
    } catch (err) {
      lastError = err; // network/DNS not ready yet — retry
      continue;
    }

    if (res.status === 201) return;

    // Parse the structured error body (see EdgeCMSError.toBody()).
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const code = body?.error?.code;
    const message = body?.error?.message ?? `setup failed with status ${res.status}`;

    // Already set up, or a validation error — neither is worth retrying.
    if (res.status === 403 || code === "forbidden") throw new AdminSetupError("Admin setup has already been completed.");
    if (res.status === 422 || code === "validation_failed") throw new AdminSetupError(message);
    // 5xx / transient — retry.
    lastError = new AdminSetupError(message);
  }

  throw lastError instanceof Error ? lastError : new AdminSetupError("Admin setup failed");
}

/**
 * Poll the deployed Worker's public setup-status endpoint until it responds,
 * so callers only print the "open /admin" link once the workers.dev route is
 * actually live (it can lag a few seconds behind a fresh deploy). Returns true
 * if it became reachable within the budget, false otherwise.
 */
export async function waitForWorker(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  { attempts = 15, delayMs = 2000 }: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/admin/api/auth/setup`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url, { method: "GET" });
      if (res.ok) return true;
    } catch {
      // route not resolvable yet — keep polling
    }
    await sleep(delayMs);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
