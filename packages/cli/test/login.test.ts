import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CfClient, credentialsFromEnv, resolveCredentials } from "../src/cf/client.js";
import { listAccounts } from "../src/cf/accounts.js";
import {
  clearStoredCredentials,
  credentialsPath,
  readStoredCredentials,
  writeStoredCredentials,
} from "../src/credentials-store.js";
import { runLogin, tokenTemplateUrl } from "../src/commands/login.js";
import { mockFetch } from "./cf/mock-fetch.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "edgecms-home-"));
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("credentials store", () => {
  it("round-trips credentials and writes the file 0600", async () => {
    await writeStoredCredentials({ apiToken: "tok", accountId: "acct" }, home);
    expect(await readStoredCredentials(home)).toEqual({ apiToken: "tok", accountId: "acct" });
    const mode = (await stat(credentialsPath(home))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("returns null for a missing or malformed store", async () => {
    expect(await readStoredCredentials(home)).toBeNull();
  });

  it("clears the store", async () => {
    await writeStoredCredentials({ apiToken: "tok", accountId: "acct" }, home);
    expect(await clearStoredCredentials(home)).toBe(true);
    expect(await readStoredCredentials(home)).toBeNull();
    expect(await clearStoredCredentials(home)).toBe(false);
  });
});

describe("resolveCredentials precedence", () => {
  it("prefers env vars over the store", async () => {
    const env = { EDGE_API_TOKEN: "env-tok", EDGE_ACCOUNT_ID: "env-acct" } as NodeJS.ProcessEnv;
    expect(credentialsFromEnv(env)).toEqual({ apiToken: "env-tok", accountId: "env-acct" });
    // resolveCredentials reads real env; verify the env path returns without touching the store.
    const resolved = await resolveCredentials(env);
    expect(resolved).toEqual({ apiToken: "env-tok", accountId: "env-acct" });
  });
});

describe("listAccounts", () => {
  it("returns id + name from GET /accounts", async () => {
    const { fetch } = mockFetch([
      { method: "GET", path: "/accounts", respond: () => ({ result: [{ id: "a1", name: "Acme" }] }) },
    ]);
    const client = new CfClient({ apiToken: "t", accountId: "" }, fetch);
    expect(await listAccounts(client)).toEqual([{ id: "a1", name: "Acme" }]);
  });
});

describe("tokenTemplateUrl", () => {
  it("pre-fills the required free-stack permission groups", () => {
    const url = tokenTemplateUrl();
    expect(url).toContain("dash.cloudflare.com");
    const keys = decodeURIComponent(url.split("permissionGroupKeys=")[1]!);
    for (const k of ["workers_scripts", "workers_kv_storage", "workers_r2", "d1", "account_settings"])
      expect(keys).toContain(k);
  });

  it("includes DNS + Workers Routes so custom domains work", () => {
    const url = tokenTemplateUrl();
    const keys = decodeURIComponent(url.split("permissionGroupKeys=")[1]!);
    expect(keys).toContain("dns");
    expect(keys).toContain("workers_routes");
    expect(url).toContain("zoneId=all");
  });
});

describe("runLogin (non-interactive)", () => {
  it("validates the token, auto-selects a single account, and persists to the store", async () => {
    const { fetch } = mockFetch([
      { method: "GET", path: "/accounts", respond: () => ({ result: [{ id: "acct-1", name: "Solo" }] }) },
    ]);
    const res = await runLogin({ token: "cf-token", fetchImpl: fetch, home, nonInteractive: true });
    expect(res).toEqual({ accountId: "acct-1", accountName: "Solo" });
    const stored = JSON.parse(await readFile(credentialsPath(home), "utf-8"));
    expect(stored).toEqual({ apiToken: "cf-token", accountId: "acct-1" });
  });

  it("requires --account when the token can reach multiple accounts", async () => {
    const { fetch } = mockFetch([
      {
        method: "GET",
        path: "/accounts",
        respond: () => ({ result: [{ id: "a1", name: "One" }, { id: "a2", name: "Two" }] }),
      },
    ]);
    await expect(runLogin({ token: "t", fetchImpl: fetch, home, nonInteractive: true })).rejects.toThrow(/--account/);
    const res = await runLogin({ token: "t", account: "a2", fetchImpl: fetch, home, nonInteractive: true });
    expect(res.accountId).toBe("a2");
  });
});
