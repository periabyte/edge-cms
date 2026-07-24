import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareProject } from "../src/project.js";
import { runMigrate } from "../src/commands/migrate.js";
import { readState } from "../src/state.js";

let dir: string;

const CONFIG_TS = `
import { defineConfig, collection, field } from "kalayaan";

export default defineConfig({
  name: "e2e-blog",
  collections: [
    collection("posts", {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
      },
    }),
  ],
});
`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kalayaan-e2e-"));
  const { writeFile, mkdir, symlink } = await import("node:fs/promises");
  await writeFile(join(dir, "cms.config.ts"), CONFIG_TS);
  // The config imports from the "kalayaan" umbrella package; give the temp
  // project a node_modules that resolves it to our workspace build, the
  // same way a real install would.
  await mkdir(join(dir, "node_modules"), { recursive: true });
  const target = join(import.meta.dirname, "../../kalayaan");
  await symlink(target, join(dir, "node_modules", "kalayaan"), "dir").catch(() => undefined);
}, 20_000);

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("CLI project pipeline (real files, no process spawn)", () => {
  it("prepareProject writes a generated config module, worker entry, and wrangler.json", async () => {
    const prepared = await prepareProject(dir);
    expect(prepared.loaded.resolved.name).toBe("e2e-blog");
    expect(existsSync(join(dir, ".kalayaan", "config.generated.mjs"))).toBe(true);
    expect(existsSync(prepared.entryPath)).toBe(true);
    expect(existsSync(prepared.wranglerConfigPath)).toBe(true);

    const generated = await readFile(join(dir, ".kalayaan", "config.generated.mjs"), "utf-8");
    expect(generated).toContain('"name": "e2e-blog"');

    expect(prepared.wranglerConfig).toMatchObject({
      name: "e2e-blog",
      d1_databases: [{ binding: "DB", database_name: "e2e-blog-db" }],
    });
  });

  it("is idempotent — running it twice doesn't error and produces the same wrangler.json shape", async () => {
    const first = await prepareProject(dir);
    const second = await prepareProject(dir);
    expect(second.wranglerConfig).toEqual(first.wranglerConfig);
  });
});

describe("kalayaan migrate (spawns real wrangler d1 execute --local)", () => {
  it("dry-run prints the plan without touching state or the local database", async () => {
    const result = await runMigrate({ projectDir: dir, dryRun: true });
    expect(result.changed).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.sql).toContain('CREATE TABLE "posts"');

    const state = await readState(dir);
    expect(state.schema).toBeNull();
    expect(state.migrations).toEqual([]);
  });

  it("applies the migration to local D1 and records it in state.json", async () => {
    const result = await runMigrate({ projectDir: dir });
    expect(result.applied).toBe(true);
    expect(result.destructive).toBe(false);

    const state = await readState(dir);
    expect(state.migrations).toHaveLength(1);
    expect(state.schema?.collections.map((c) => c.name)).toEqual(["posts"]);

    // Re-running with no config changes is a no-op.
    const again = await runMigrate({ projectDir: dir });
    expect(again.changed).toBe(false);
  }, 30_000);

  it("refuses a destructive change without --allow-destructive", async () => {
    await runMigrate({ projectDir: dir });

    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(dir, "cms.config.ts"),
      `
import { defineConfig, collection, field } from "kalayaan";
export default defineConfig({
  name: "e2e-blog",
  collections: [collection("posts", { fields: { title: field.text({ required: true }) } })],
});
`,
    ); // dropped the "slug" field

    // Dry-run previews a destructive plan without needing --allow-destructive.
    const dryRun = await runMigrate({ projectDir: dir, dryRun: true });
    expect(dryRun.destructive).toBe(true);
    expect(dryRun.applied).toBe(false);

    // Actually applying it is blocked until --allow-destructive is passed.
    await expect(runMigrate({ projectDir: dir })).rejects.toThrow(/destructive/i);

    const applied = await runMigrate({ projectDir: dir, allowDestructive: true });
    expect(applied.applied).toBe(true);
  }, 45_000);
}, 60_000);
