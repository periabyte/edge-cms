import { describe, expect, it, vi } from "vitest";
import { AdminSetupError, bootstrapAdmin, waitForWorker } from "../src/admin-setup.js";

const creds = { email: "root@example.com", password: "supersecret1" };
const ok = () => new Response(JSON.stringify({ user: {}, csrfToken: "x" }), { status: 201, headers: { "content-type": "application/json" } });
const err = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "content-type": "application/json" } });

describe("bootstrapAdmin", () => {
  it("POSTs credentials to the deployed setup endpoint and resolves on 201", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await bootstrapAdmin("https://site.workers.dev", creds, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://site.workers.dev/admin/api/auth/setup");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(creds);
  });

  it("throws a clear error (no retry) when setup was already completed", async () => {
    const fetchImpl = vi.fn(async () => err(403, "forbidden", "Setup has already been completed"));
    await expect(
      bootstrapAdmin("https://site.workers.dev", creds, fetchImpl as unknown as typeof fetch, { retries: 3, delayMs: 0 }),
    ).rejects.toBeInstanceOf(AdminSetupError);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // not retried
  });

  it("does not retry a validation error", async () => {
    const fetchImpl = vi.fn(async () => err(422, "validation_failed", "password too short"));
    await expect(
      bootstrapAdmin("https://site.workers.dev", creds, fetchImpl as unknown as typeof fetch, { retries: 3, delayMs: 0 }),
    ).rejects.toThrow(/password too short/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a not-yet-warm subdomain, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ENOTFOUND"))
      .mockResolvedValueOnce(ok());
    await bootstrapAdmin("https://site.workers.dev", creds, fetchImpl as unknown as typeof fetch, { retries: 3, delayMs: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("waitForWorker", () => {
  it("returns true once the worker responds, polling the setup-status route", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ENOTFOUND"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ needsSetup: true }), { status: 200 }));
    const ready = await waitForWorker("https://site.workers.dev", fetchImpl as unknown as typeof fetch, { attempts: 5, delayMs: 0 });
    expect(ready).toBe(true);
    expect((fetchImpl.mock.calls[0]![0] as string)).toBe("https://site.workers.dev/admin/api/auth/setup");
  });

  it("returns false when the worker never becomes reachable within the budget", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 522 }));
    const ready = await waitForWorker("https://site.workers.dev", fetchImpl as unknown as typeof fetch, { attempts: 3, delayMs: 0 });
    expect(ready).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
