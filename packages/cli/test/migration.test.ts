import { describe, expect, it } from "vitest";
import { collection, defineConfig, field, resolveConfig, snapshotOf } from "@kalayaan/config";
import { checksumOf, planMigration } from "../src/migration.js";

const blog = () =>
  resolveConfig(
    defineConfig({
      name: "x",
      collections: [
        collection("posts", { fields: { title: field.text({ required: true }) } }),
      ],
    }),
  );

describe("planMigration", () => {
  it("emits create-table DDL on first migration and flags it non-destructive", () => {
    const plan = planMigration(blog(), null);
    expect(plan.destructive).toBe(false);
    expect(plan.sql).toContain('CREATE TABLE "posts"');
    expect(plan.sql.trim().endsWith(";")).toBe(true);
  });

  it("is a no-op when re-planning against its own resulting snapshot", () => {
    const config = blog();
    const first = planMigration(config, null);
    const second = planMigration(config, first.nextSnapshot);
    expect(second.statements).toEqual([]);
    expect(second.sql).toBe("");
  });

  it("flags a dropped field as destructive", () => {
    const config = blog();
    const first = planMigration(config, null);
    const dropped = resolveConfig(defineConfig({ name: "x", collections: [collection("posts", { fields: {} })] }));
    const second = planMigration(dropped, first.nextSnapshot);
    expect(second.destructive).toBe(true);
  });

  it("nextSnapshot matches snapshotOf(config) directly", () => {
    const config = blog();
    const plan = planMigration(config, null);
    expect(plan.nextSnapshot).toEqual(snapshotOf(config));
  });

  it("reconciles the fixed system tables on EVERY migration via systemStatements, never in the config diff", () => {
    // System tables aren't config-driven, so they never show up in a schema
    // diff. They live in `systemStatements` (all CREATE ... IF NOT EXISTS) and
    // are reconciled on every migrate/deploy — so a newly-added system table
    // reaches already-migrated projects — without ever entering the config
    // `sql`/checksum that feeds the migration journal.
    const config = blog();
    const first = planMigration(config, null);
    expect(first.systemSql).toContain('CREATE TABLE IF NOT EXISTS "users"');
    expect(first.systemSql).toContain('CREATE TABLE IF NOT EXISTS "api_keys"');
    expect(first.systemSql).toContain('CREATE TABLE IF NOT EXISTS "media"');
    expect(first.systemSql).toContain('CREATE TABLE IF NOT EXISTS "_versions"');
    expect(first.systemSql).toContain('CREATE TABLE IF NOT EXISTS "webhooks"');
    expect(first.systemSql).toContain('CREATE TABLE IF NOT EXISTS "saved_filters"');
    // The config diff never carries system DDL.
    expect(first.sql).not.toContain("IF NOT EXISTS");

    // A later migration (prevSnapshot set) still reconciles all system tables...
    const second = planMigration(config, first.nextSnapshot);
    expect(second.systemSql).toContain('CREATE TABLE IF NOT EXISTS "users"');
    expect(second.systemSql).toContain('CREATE TABLE IF NOT EXISTS "webhooks"');
    // ...while the config diff stays empty, preserving the "nothing to migrate" fast path.
    expect(second.statements).toEqual([]);
    expect(second.sql).toBe("");
  });
});

describe("planMigration destructive flag", () => {
  it("is derivable from the plan alone, so callers can preview it before deciding whether to gate on it", () => {
    // Regression guard: runMigrate's --dry-run must be able to show a
    // destructive plan without needing --allow-destructive — that decision
    // belongs to the caller (see commands/migrate.ts), not to planning.
    const config = blog();
    const first = planMigration(config, null);
    const dropped = resolveConfig(defineConfig({ name: "x", collections: [collection("posts", { fields: {} })] }));
    const second = planMigration(dropped, first.nextSnapshot);
    expect(second.destructive).toBe(true);
    expect(second.sql).toContain("posts"); // plan is fully computed regardless of the flag
  });
});

describe("checksumOf", () => {
  it("is deterministic and sensitive to content", async () => {
    expect(await checksumOf("a")).toBe(await checksumOf("a"));
    expect(await checksumOf("a")).not.toBe(await checksumOf("b"));
  });
});
