import type { SchemaSnapshot } from "@kalayaan/config";
import type { DatabaseAdapter } from "@kalayaan/core";
import { RelationalAdapter, type SqlRows } from "@kalayaan/adapter-relational";
import { postgresDialect } from "./dialect.js";

/**
 * The minimal client surface the adapter needs — one `query` that takes SQL
 * with `$1..$n` placeholders and returns rows, plus `begin` for a real
 * transaction. Both node-postgres (`pg`) and porsager's `postgres` map onto
 * this via the helpers in `driver.ts`, and tests inject a fake.
 */
export interface PgClient {
  query(text: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  begin<T>(fn: (tx: PgClient) => Promise<T>): Promise<T>;
}

export class PostgresAdapter extends RelationalAdapter {
  constructor(
    private readonly client: PgClient,
    snapshot: SchemaSnapshot,
  ) {
    super(snapshot, postgresDialect);
  }

  protected async exec(sql: string, params: unknown[]): Promise<SqlRows> {
    const result = await this.client.query(this.dialect.renderParams(sql), params);
    return { rows: result.rows };
  }

  protected async execBatch(statements: { sql: string; params: unknown[] }[]): Promise<void> {
    if (statements.length === 0) return;
    if (statements.length === 1) {
      const s = statements[0]!;
      await this.client.query(this.dialect.renderParams(s.sql), s.params);
      return;
    }
    // Real transaction — Postgres gives full atomicity, unlike D1's batch.
    await this.client.begin(async (tx) => {
      for (const s of statements) await tx.query(this.dialect.renderParams(s.sql), s.params);
    });
  }

  override async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    return this.client.begin((tx) => fn(new PostgresAdapter(tx, this.snapshot)));
  }
}
