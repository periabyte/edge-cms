import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareProject } from "../project.js";
import { checksumOf, planMigration } from "../migration.js";
import { lastSnapshot, readState, writeState } from "../state.js";
import { resolveWranglerBin } from "../wrangler-bin.js";
import { ulid } from "@kalayaan/core";

export interface MigrateOptions {
  projectDir: string;
  dryRun?: boolean;
  allowDestructive?: boolean;
}

export interface MigrateResult {
  changed: boolean;
  destructive: boolean;
  sql: string;
  applied: boolean;
}

/**
 * `kalayaan migrate`: diffs the current config against the last applied
 * schema snapshot and applies the SQL to the local D1 database.
 * `--dry-run` only prints the plan; destructive changes (dropped
 * fields/collections, narrowed selects, removed locales) require
 * `--allow-destructive` or the command refuses to run.
 */
export async function runMigrate(opts: MigrateOptions): Promise<MigrateResult> {
  const { loaded, wranglerConfigPath, wranglerConfig } = await prepareProject(opts.projectDir);
  const state = await readState(opts.projectDir);
  const plan = planMigration(loaded.resolved, lastSnapshot(state));
  const hasConfigChange = plan.statements.length > 0;

  // Dry-run only previews the config plan (destructive or not — the gate
  // below only blocks actually applying it) and never touches the database,
  // so system reconcile is not run here either.
  if (opts.dryRun) {
    return { changed: hasConfigChange, destructive: plan.destructive, sql: plan.sql, applied: false };
  }
  if (hasConfigChange && plan.destructive && !opts.allowDestructive) {
    throw new Error(
      "This migration includes destructive changes (dropped fields/collections, a narrowed select, " +
        "or a removed locale). Re-run with --allow-destructive to proceed, after confirming with the user.",
    );
  }

  const migrationsDir = join(opts.projectDir, ".kalayaan", "migrations");
  await mkdir(migrationsDir, { recursive: true });

  const execSql = async (fileName: string, sql: string): Promise<void> => {
    const sqlPath = join(migrationsDir, fileName);
    await writeFile(sqlPath, sql);
    const wrangler = resolveWranglerBin();
    execFileSync(
      process.execPath,
      [
        wrangler,
        "d1",
        "execute",
        wranglerConfig.d1_databases[0]!.database_name,
        "--local",
        "--config",
        wranglerConfigPath,
        "--file",
        sqlPath,
      ],
      { cwd: opts.projectDir, stdio: "inherit" },
    );
  };

  // 1. Always reconcile system tables first. Every statement is
  // CREATE ... IF NOT EXISTS, so this is a cheap no-op on healthy databases
  // and self-heals missing/newly-added system tables (e.g. webhooks,
  // saved_filters) on already-migrated projects. Written to a fixed,
  // non-journaled file that is overwritten each run.
  await execSql("_system.sql", plan.systemSql);

  // 1b. Best-effort column reconcile (e.g. `users.name`, added after that
  // table already shipped). SQLite has no `ADD COLUMN IF NOT EXISTS`, so this
  // fails with "duplicate column name" on every run after the first — swallow
  // it rather than let a self-heal-only step break local dev.
  if (plan.systemReconcileStatements.length > 0) {
    const sql = plan.systemReconcileStatements.map((s) => s.sql).join(";\n") + ";\n";
    try {
      await execSql("_system_reconcile.sql", sql);
    } catch {
      // Expected once the column already exists — not a real failure.
    }
  }

  // 2. Apply the config-driven migration only when the schema actually
  // changed, preserving the "nothing to migrate" fast path and the journal.
  if (!hasConfigChange) {
    return { changed: false, destructive: false, sql: "", applied: false };
  }

  const id = ulid();
  await execSql(`${id}.sql`, plan.sql);

  const checksum = await checksumOf(plan.sql);
  await writeState(opts.projectDir, {
    ...state,
    schema: { snapshotVersion: 1, collections: plan.nextSnapshot.collections },
    migrations: [...state.migrations, { id, checksum, appliedAt: Date.now() }],
  });

  return { changed: true, destructive: plan.destructive, sql: plan.sql, applied: true };
}
