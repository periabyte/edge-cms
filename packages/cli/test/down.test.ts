import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CfClient } from "../src/cf/client.js";
import { runDown } from "../src/commands/down.js";
import { readState, writeState, type EdgeCmsState } from "../src/state.js";
import { mockFetch, type MockRoute } from "./cf/mock-fetch.js";

let dir: string;
const creds = { apiToken: "tok", accountId: "acct" };

const deployedState: EdgeCmsState = {
  version: 1,
  resources: {
    worker: { name: "e2e", secretsInitialized: true },
    d1: { id: "d1-id", name: "e2e-db" },
    kv: { cache: "kv-cache", sessions: "kv-sessions" },
    r2: { name: "e2e-media" },
  },
  schema: { snapshotVersion: 1, collections: [] },
  migrations: [{ id: "m1", checksum: "abc", appliedAt: 1 }],
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kalayaan-down-"));
  await writeState(dir, deployedState);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function deleteRoutes(): MockRoute[] {
  return [
    { method: "DELETE", path: /\/workers\/scripts\/[^/]+/, respond: () => ({ result: {} }) },
    { method: "DELETE", path: /\/d1\/database\/.+/, respond: () => ({ result: {} }) },
    { method: "DELETE", path: /\/storage\/kv\/namespaces\/.+/, respond: () => ({ result: {} }) },
    { method: "DELETE", path: /\/r2\/buckets\/.+/, respond: () => ({ result: {} }) },
  ];
}

describe("runDown", () => {
  it("lists targets without touching anything on a dry run", async () => {
    const preview = await runDown({ projectDir: dir, dryRun: true });
    expect(preview.resources).toEqual([
      "Worker: e2e",
      "D1 database: e2e-db",
      "KV namespace: cache",
      "KV namespace: sessions",
      "R2 bucket: e2e-media",
    ]);
    expect(preview.deleted).toEqual([]);
    // State untouched by a dry run.
    expect((await readState(dir)).resources.worker?.name).toBe("e2e");
  });

  it("deletes every recorded resource and resets local state", async () => {
    const { fetch, calls } = mockFetch(deleteRoutes());
    const client = new CfClient(creds, fetch);

    const result = await runDown({ projectDir: dir, client });
    expect(result.deleted).toHaveLength(5);
    expect(result.failed).toEqual([]);

    // Worker is deleted first so nothing references the torn-down bindings.
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.path).toContain("/workers/scripts/e2e");

    // State reset so a later deploy provisions cleanly.
    const after = await readState(dir);
    expect(after.resources).toEqual({});
    expect(after.migrations).toEqual([]);
    expect(after.schema).toBeNull();
  });

  it("records failures but still resets state (partial teardown is recoverable)", async () => {
    const { fetch } = mockFetch([
      { method: "DELETE", path: /\/workers\/scripts\/[^/]+/, respond: () => ({ result: {} }) },
      { method: "DELETE", path: /\/d1\/database\/.+/, respond: () => ({ status: 400, success: false }) },
      { method: "DELETE", path: /\/storage\/kv\/namespaces\/.+/, respond: () => ({ result: {} }) },
      { method: "DELETE", path: /\/r2\/buckets\/.+/, respond: () => ({ result: {} }) },
    ]);
    const client = new CfClient(creds, fetch);
    const result = await runDown({ projectDir: dir, client });
    expect(result.failed.some((f) => f.startsWith("D1 database"))).toBe(true);
    expect(result.deleted.length).toBe(4);
    expect((await readState(dir)).resources).toEqual({});
  });

  it("detaches custom domains before deleting the Worker", async () => {
    await writeState(dir, {
      ...deployedState,
      resources: { ...deployedState.resources, domains: [{ hostname: "blog.example.com", id: "dom-1" }] },
    });
    const { fetch, calls } = mockFetch([
      { method: "DELETE", path: /\/workers\/domains\/.+/, respond: () => ({ result: {} }) },
      ...deleteRoutes(),
    ]);
    const result = await runDown({ projectDir: dir, client: new CfClient(creds, fetch) });
    expect(result.deleted[0]).toBe("Custom domain: blog.example.com");
    // Domain detach is the first API call, before the worker delete.
    expect(calls[0]!.path).toContain("/workers/domains/dom-1");
    expect(calls[1]!.path).toContain("/workers/scripts/e2e");
  });

  it("is a no-op when nothing has been deployed", async () => {
    await rm(join(dir, ".kalayaan", "state.json"), { force: true });
    const result = await runDown({ projectDir: dir });
    expect(result.resources).toEqual([]);
    expect(result.deleted).toEqual([]);
  });
});
