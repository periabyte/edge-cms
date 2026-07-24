import type { SchemaSnapshot } from "@kalayaan/config";
import type { DatabaseAdapter } from "@kalayaan/core";
import { RelationalAdapter, type SqlRows } from "@kalayaan/adapter-relational";
import { mysqlDialect } from "./dialect.js";

/**
 * Minimal client surface: a `query` over `?`-placeholdered SQL and a `begin`
 * for a transaction. mysql2's pool/connection maps onto this via `driver.ts`,
 * and tests inject a fake. Note MySQL implicitly commits on DDL, so a
 * transaction around migration statements is best-effort (non-atomic) — the
 * documented MySQL limitation.
 */
export interface MysqlClient {
  query(text: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  begin<T>(fn: (tx: MysqlClient) => Promise<T>): Promise<T>;
}

export class MysqlAdapter extends RelationalAdapter {
  constructor(
    private readonly client: MysqlClient,
    snapshot: SchemaSnapshot,
  ) {
    super(snapshot, mysqlDialect);
  }

  protected async exec(sql: string, params: unknown[]): Promise<SqlRows> {
    const result = await this.client.query(sql, params);
    return { rows: result.rows };
  }

  protected async execBatch(statements: { sql: string; params: unknown[] }[]): Promise<void> {
    if (statements.length === 0) return;
    if (statements.length === 1) {
      const s = statements[0]!;
      await this.client.query(s.sql, s.params);
      return;
    }
    await this.client.begin(async (tx) => {
      for (const s of statements) await tx.query(s.sql, s.params);
    });
  }

  override async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    return this.client.begin((tx) => fn(new MysqlAdapter(tx, this.snapshot)));
  }
}
