import type { ResolvedConfig } from "@edgecms/config";
import type { MigrationPlan } from "./migration.js";

/**
 * Apply a migration plan directly to an external Postgres/MySQL database (not
 * via the Cloudflare D1 HTTP API). The CLI connects with the same driver the
 * runtime uses over Hyperdrive; the driver is an optional peer dependency, so
 * this is only reached on an external-DB deploy and imported lazily.
 *
 * Like the D1 path, system-table DDL is reconciled first (idempotent
 * CREATE ... IF NOT EXISTS), then the config-diff statements run in order.
 * Postgres wraps everything in one transaction; MySQL can't (implicit DDL
 * commits) so it applies sequentially — matching each engine's documented
 * migration semantics.
 */
export async function applyExternalMigration(
  config: ResolvedConfig,
  connectionString: string,
  plan: MigrationPlan,
): Promise<void> {
  const statements = [...plan.systemStatements, ...plan.statements].map((s) => s.sql);
  // Best-effort column reconcile (e.g. `users.name`, added after that table
  // already shipped) — not part of `statements` because it isn't safe to
  // blindly re-run; "duplicate column" failures are expected after the first
  // apply and are swallowed per-statement below.
  const reconcile = plan.systemReconcileStatements.map((s) => s.sql);
  if (statements.length === 0 && reconcile.length === 0) return;

  if (config.database.adapter === "postgres") {
    const { connectPostgres } = await import("@edgecms/adapter-postgres");
    const { client, close } = await connectPostgres(connectionString);
    try {
      if (statements.length > 0) {
        await client.begin(async (tx) => {
          for (const sql of statements) await tx.query(sql, []);
        });
      }
      for (const sql of reconcile) {
        try {
          await client.query(sql, []);
        } catch (err) {
          if (!/duplicate column|already exists/i.test((err as Error).message)) throw err;
        }
      }
    } finally {
      await close();
    }
    return;
  }

  if (config.database.adapter === "mysql") {
    const { connectMysql } = await import("@edgecms/adapter-mysql");
    const { client, close } = await connectMysql(connectionString);
    try {
      for (const sql of statements) await client.query(sql, []);
      for (const sql of reconcile) {
        try {
          await client.query(sql, []);
        } catch (err) {
          if (!/duplicate column/i.test((err as Error).message)) throw err;
        }
      }
    } finally {
      await close();
    }
    return;
  }

  throw new Error(`applyExternalMigration does not support adapter "${config.database.adapter}"`);
}
