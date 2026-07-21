import type { SchemaSnapshot } from "@edgecms/config";
import { RelationalAdapter, type SqlRows } from "@edgecms/adapter-relational";
import { sqliteDialect } from "./dialect.js";

export class D1Adapter extends RelationalAdapter {
  constructor(
    private readonly db: D1Database,
    snapshot: SchemaSnapshot,
  ) {
    super(snapshot, sqliteDialect);
  }

  protected async exec(sql: string, params: unknown[]): Promise<SqlRows> {
    const result = await this.db
      .prepare(sql)
      .bind(...params)
      .all();
    return { rows: result.results as Record<string, unknown>[] };
  }

  protected async execBatch(statements: { sql: string; params: unknown[] }[]): Promise<void> {
    if (statements.length === 0) return;
    if (statements.length === 1) {
      const s = statements[0]!;
      await this.db
        .prepare(s.sql)
        .bind(...s.params)
        .run();
      return;
    }
    await this.db.batch(statements.map((s) => this.db.prepare(s.sql).bind(...s.params)));
  }
}
