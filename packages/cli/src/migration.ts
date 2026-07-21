import { diffSnapshots, snapshotOf, type ResolvedConfig, type SchemaSnapshot } from "@edgecms/config";
import { emitDDL, type SqlDialect, type SqlStatement } from "@edgecms/adapter-relational";
import { sqliteDialect, SYSTEM_TABLE_DDL, SYSTEM_TABLE_RECONCILE_DDL } from "@edgecms/adapter-d1";
import { postgresDialect, PG_SYSTEM_TABLE_DDL } from "@edgecms/adapter-postgres";
import { mysqlDialect, MYSQL_SYSTEM_TABLE_DDL, MYSQL_SYSTEM_TABLE_RECONCILE_DDL } from "@edgecms/adapter-mysql";

export interface MigrationPlan {
  nextSnapshot: SchemaSnapshot;
  /** Config-driven DDL from the schema diff — the only statements that get checksummed/journaled. */
  statements: SqlStatement[];
  destructive: boolean;
  /** Config-diff SQL joined with semicolons — what gets executed/hashed for the migration journal. */
  sql: string;
  /**
   * System-table DDL (users, api_keys, media, _versions, webhooks, saved_filters).
   * Every statement is CREATE ... IF NOT EXISTS, so it's a no-op on healthy
   * databases and self-heals missing/newly-added system tables. Reconciled on
   * EVERY migrate/deploy, so adding a new system table reaches already-migrated
   * projects. Not part of the config diff, so it never enters the checksum/journal.
   */
  systemStatements: SqlStatement[];
  /** System-table DDL joined with semicolons. */
  systemSql: string;
  /**
   * Additive `ALTER TABLE ADD COLUMN` reconciliation for columns added after
   * a table already shipped (see `SYSTEM_TABLE_RECONCILE_DDL`). Unlike
   * `systemStatements`, these are NOT safe to blindly re-run — most dialects
   * here lack `ADD COLUMN IF NOT EXISTS`, so executors must run this list
   * separately and treat "duplicate column" as success.
   */
  systemReconcileStatements: SqlStatement[];
}

/** The SQL dialect and system-table DDL for a configured database engine. */
function engineFor(adapter: ResolvedConfig["database"]["adapter"]): {
  dialect: SqlDialect;
  systemDDL: string[];
  systemReconcileDDL: string[];
} {
  switch (adapter) {
    case "postgres":
      // Postgres supports `ADD COLUMN IF NOT EXISTS` natively — no separate reconcile list needed.
      return { dialect: postgresDialect, systemDDL: PG_SYSTEM_TABLE_DDL, systemReconcileDDL: [] };
    case "mysql":
      return { dialect: mysqlDialect, systemDDL: MYSQL_SYSTEM_TABLE_DDL, systemReconcileDDL: MYSQL_SYSTEM_TABLE_RECONCILE_DDL };
    default:
      // d1 (and mongodb, which doesn't reach the relational migrator).
      return { dialect: sqliteDialect, systemDDL: SYSTEM_TABLE_DDL, systemReconcileDDL: SYSTEM_TABLE_RECONCILE_DDL };
  }
}

export function planMigration(config: ResolvedConfig, prevSnapshot: SchemaSnapshot | null): MigrationPlan {
  const { dialect, systemDDL, systemReconcileDDL } = engineFor(config.database.adapter);
  const nextSnapshot = snapshotOf(config);
  const changes = diffSnapshots(prevSnapshot, nextSnapshot);
  const statements = emitDDL(dialect, changes, nextSnapshot, prevSnapshot);
  const sql = statements.map((s) => s.sql).join(";\n") + (statements.length ? ";\n" : "");

  const systemStatements: SqlStatement[] = systemDDL.map((sql) => ({ sql, destructive: false }));
  const systemSql = systemStatements.map((s) => s.sql).join(";\n") + (systemStatements.length ? ";\n" : "");
  const systemReconcileStatements: SqlStatement[] = systemReconcileDDL.map((sql) => ({ sql, destructive: false }));

  return {
    nextSnapshot,
    statements,
    destructive: statements.some((s) => s.destructive),
    sql,
    systemStatements,
    systemSql,
    systemReconcileStatements,
  };
}

export async function checksumOf(sql: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sql));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
