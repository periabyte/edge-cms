import { mkdtemp, rm, symlink, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CfClient } from "../src/cf/client.js";
import { runDeploy } from "../src/commands/deploy.js";
import { readState } from "../src/state.js";
import { mockFetch, type MockRoute } from "./cf/mock-fetch.js";

let dir: string;
const creds = { apiToken: "tok", accountId: "acct" };

const CONFIG_TS = `
import { defineConfig, collection, field } from "kalayaan";

export default defineConfig({
  name: "e2e-deploy",
  collections: [
    collection("posts", { fields: { title: field.text({ required: true }) } }),
  ],
});
`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kalayaan-deploy-"));
  await writeFile(join(dir, "cms.config.ts"), CONFIG_TS);
  await mkdir(join(dir, "node_modules", "@edgecms"), { recursive: true });
  // Unlike `kalayaan dev` (which hands off to wrangler's own bundler, whose
  // symlink-realpath resolution reaches into the monorepo's nested
  // node_modules), `deploy` bundles with our own esbuild call — so this
  // mirrors what a flat `npm install kalayaan` actually hoists to the
  // project root, rather than relying on that extra resolution behavior.
  const packagesDir = join(import.meta.dirname, "../..");
  const link = (name: string, target: string) =>
    symlink(join(packagesDir, target), join(dir, "node_modules", "@edgecms", name), "dir").catch(() => undefined);
  await symlink(join(packagesDir, "kalayaan"), join(dir, "node_modules", "kalayaan"), "dir").catch(() => undefined);
  await link("config", "config");
  await link("core", "core");
  await link("runtime", "runtime");
  await link("adapter-d1", "adapters/d1");
  await link("adapter-relational", "adapters/relational");
  await link("storage-r2", "storage/r2");
}, 20_000);

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A fresh-account route set: nothing exists yet, so every ensure* call creates. */
function freshAccountRoutes(): MockRoute[] {
  const kvIds = new Map<string, string>();
  return [
    { method: "GET", path: "/accounts/acct/d1/database", respond: () => ({ result: [] }) },
    {
      method: "POST",
      path: "/accounts/acct/d1/database",
      respond: ({ body }) => ({ result: { uuid: "d1-id", name: (body as { name: string }).name } }),
    },
    { method: "GET", path: "/accounts/acct/r2/buckets", respond: () => ({ result: { buckets: [] } }) },
    { method: "POST", path: "/accounts/acct/r2/buckets", respond: () => ({ result: {} }) },
    { method: "PUT", path: /\/accounts\/acct\/r2\/buckets\/.+\/cors/, respond: () => ({ result: {} }) },
    { method: "GET", path: "/accounts/acct/storage/kv/namespaces", respond: () => ({ result: [] }) },
    {
      method: "POST",
      path: "/accounts/acct/storage/kv/namespaces",
      respond: ({ body }) => {
        const title = (body as { title: string }).title;
        const id = `kv-${title}`;
        kvIds.set(title, id);
        return { result: { id, title } };
      },
    },
    {
      method: "POST",
      path: /\/accounts\/acct\/d1\/database\/.+\/query/,
      respond: ({ body }) => {
        // A fresh deploy has no users yet → the admin-setup check sees zero.
        const sql = (body as { sql?: string }).sql ?? "";
        const results = sql.includes("count(*)") ? [{ n: 0 }] : [];
        return { result: [{ results, success: true, meta: { duration: 0 } }] };
      },
    },
    // Admin SPA assets are uploaded by default now (resolved from @edgecms/admin's
    // dist). The upload-session fast path returns a completion JWT directly.
    {
      method: "POST",
      path: /\/accounts\/acct\/workers\/scripts\/[^/]+\/assets-upload-session/,
      respond: () => ({ result: { jwt: "asset-completion-jwt", buckets: [] } }),
    },
    { method: "PUT", path: /\/accounts\/acct\/workers\/scripts\/[^/]+\/secrets/, respond: () => ({ result: {} }) },
    { method: "PUT", path: /\/accounts\/acct\/workers\/scripts\/[^/]+$/, respond: () => ({ result: {} }) },
    {
      method: "POST",
      path: /\/accounts\/acct\/workers\/scripts\/.+\/subdomain/,
      respond: () => ({ result: {} }),
    },
    {
      method: "GET",
      path: "/accounts/acct/workers/subdomain",
      respond: () => ({ result: { subdomain: "my-account" } }),
    },
  ];
}

describe("runDeploy", () => {
  it("provisions resources, applies the initial migration, and deploys the Worker", async () => {
    const { fetch, calls } = mockFetch(freshAccountRoutes());
    const client = new CfClient(creds, fetch);

    const result = await runDeploy({ projectDir: dir, client });

    expect(result.url).toBe("https://e2e-deploy.my-account.workers.dev");
    expect(result.migrationApplied).toBe(true);
    expect(result.resources.d1).toEqual({ id: "d1-id", name: "e2e-deploy-db" });
    // Fresh deploy has no users → the CLI should offer to bootstrap the admin.
    expect(result.needsAdminSetup).toBe(true);

    const state = await readState(dir);
    expect(state.resources.worker).toEqual({ name: "e2e-deploy", secretsInitialized: true });
    expect(state.migrations).toHaveLength(1);

    // Secret is set exactly once on a fresh deploy.
    const secretCalls = calls.filter((c) => c.path.endsWith("/secrets"));
    expect(secretCalls).toHaveLength(1);

    // Worker script upload happened with D1/R2/KV bindings.
    const scriptCall = calls.find((c) => c.method === "PUT" && /\/workers\/scripts\/[^/]+$/.test(c.path));
    expect(scriptCall).toBeDefined();
    // The admin SPA assets are uploaded by default (dist resolved from @edgecms/admin).
    expect(calls.some((c) => c.path.includes("/assets-upload-session"))).toBe(true);

    // The script must be uploaded BEFORE the secret is set — on a first-ever
    // deploy the script doesn't exist yet, and Cloudflare's secrets endpoint
    // 404s ("This Worker does not exist on your account.") if called first.
    const scriptIdx = calls.findIndex((c) => c.method === "PUT" && /\/workers\/scripts\/[^/]+$/.test(c.path));
    const secretIdx = calls.findIndex((c) => c.method === "PUT" && c.path.endsWith("/secrets"));
    expect(scriptIdx).toBeGreaterThanOrEqual(0);
    expect(secretIdx).toBeGreaterThan(scriptIdx);
  }, 20_000);

  it("attaches a custom domain (flag) and records it in state", async () => {
    const { fetch } = mockFetch([
      ...freshAccountRoutes(),
      { method: "GET", path: "/accounts/acct/workers/domains", respond: () => ({ result: [] }) },
      {
        method: "PUT",
        path: "/accounts/acct/workers/domains",
        respond: ({ body }) => ({ result: { id: "dom-1", hostname: (body as { hostname: string }).hostname, service: "e2e-deploy" } }),
      },
    ]);
    const result = await runDeploy({ projectDir: dir, client: new CfClient(creds, fetch), domain: "blog.example.com" });
    expect(result.customDomains).toEqual(["blog.example.com"]);
    expect(result.url).toBe("https://e2e-deploy.my-account.workers.dev"); // workers.dev stays the reliable base
    expect((await readState(dir)).resources.domains).toEqual([{ hostname: "blog.example.com", id: "dom-1" }]);
  }, 20_000);

  it("a domain not on Cloudflare warns but the deploy still succeeds on workers.dev", async () => {
    const { fetch } = mockFetch([
      ...freshAccountRoutes(),
      { method: "GET", path: "/accounts/acct/workers/domains", respond: () => ({ result: [] }) },
      { method: "PUT", path: "/accounts/acct/workers/domains", respond: () => ({ status: 400, success: false }) },
    ]);
    const result = await runDeploy({ projectDir: dir, client: new CfClient(creds, fetch), domain: "notmine.example" });
    expect(result.url).toBe("https://e2e-deploy.my-account.workers.dev");
    expect(result.customDomains).toBeUndefined();
    expect(result.domainWarnings?.[0]).toMatch(/notmine\.example/);
    expect((await readState(dir)).resources.domains).toBeUndefined();
  }, 20_000);

  it("redeploying is idempotent: no duplicate resources, no schema re-migration, secret not reset", async () => {
    const { fetch, calls } = mockFetch(freshAccountRoutes());
    const client = new CfClient(creds, fetch);
    await runDeploy({ projectDir: dir, client });
    calls.length = 0;

    // Second deploy: resources now "exist" from the mock account's perspective.
    const { fetch: fetch2, calls: calls2 } = mockFetch([
      {
        method: "GET",
        path: "/accounts/acct/d1/database",
        respond: () => ({ result: [{ uuid: "d1-id", name: "e2e-deploy-db" }] }),
      },
      {
        method: "GET",
        path: "/accounts/acct/r2/buckets",
        respond: () => ({ result: { buckets: [{ name: "e2e-deploy-media" }] } }),
      },
      { method: "PUT", path: /\/accounts\/acct\/r2\/buckets\/.+\/cors/, respond: () => ({ result: {} }) },
      {
        method: "GET",
        path: "/accounts/acct/storage/kv/namespaces",
        respond: () => ({
          result: [
            { id: "kv-e2e-deploy-cache", title: "e2e-deploy-cache" },
            { id: "kv-e2e-deploy-sessions", title: "e2e-deploy-sessions" },
          ],
        }),
      },
      // System-table reconcile runs on every deploy (idempotent CREATE IF NOT
      // EXISTS), so the remote query endpoint is hit even when the schema is
      // unchanged and no config migration is journaled.
      {
        method: "POST",
        path: /\/accounts\/acct\/d1\/database\/.+\/query/,
        respond: ({ body }) => {
          // Second deploy: an admin already exists.
          const sql = (body as { sql?: string }).sql ?? "";
          const results = sql.includes("count(*)") ? [{ n: 1 }] : [];
          return { result: [{ results, success: true, meta: { duration: 0 } }] };
        },
      },
      {
        method: "POST",
        path: /\/accounts\/acct\/workers\/scripts\/[^/]+\/assets-upload-session/,
        respond: () => ({ result: { jwt: "asset-completion-jwt", buckets: [] } }),
      },
      { method: "PUT", path: /\/accounts\/acct\/workers\/scripts\/[^/]+$/, respond: () => ({ result: {} }) },
      {
        method: "POST",
        path: /\/accounts\/acct\/workers\/scripts\/.+\/subdomain/,
        respond: () => ({ result: {} }),
      },
      {
        method: "GET",
        path: "/accounts/acct/workers/subdomain",
        respond: () => ({ result: { subdomain: "my-account" } }),
      },
    ]);
    const client2 = new CfClient(creds, fetch2);
    const second = await runDeploy({ projectDir: dir, client: client2 });

    expect(second.migrationApplied).toBe(false); // schema unchanged, nothing journaled
    expect(second.needsAdminSetup).toBe(false); // admin already exists → no bootstrap
    // No new D1 database is *created*...
    expect(calls2.some((c) => c.method === "POST" && /\/d1\/database$/.test(c.path))).toBe(false);
    // ...but system tables are still reconciled idempotently against the existing DB.
    expect(calls2.some((c) => c.method === "POST" && /\/d1\/database\/.+\/query/.test(c.path))).toBe(true);
    expect(calls2.some((c) => c.path.endsWith("/secrets"))).toBe(false); // never re-set

    const stateAfter = await readState(dir);
    expect(stateAfter.migrations).toHaveLength(1); // reconcile adds no journal entry

    const state = await readState(dir);
    expect(state.resources.worker?.secretsInitialized).toBe(true);
  }, 20_000);
});
