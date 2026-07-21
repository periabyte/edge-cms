import type { PgClient } from "./adapter.js";

/**
 * Minimal structural type for porsager's `postgres` tagged-template client, so
 * this package needs no build-time dependency on the driver. `postgres` runs
 * in Workers over a Hyperdrive connection string and in Node directly.
 */
interface PostgresJs {
  unsafe(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  begin<T>(fn: (tx: PostgresJs) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

/** Wrap a porsager `postgres` instance (or a transaction handle) as a PgClient. */
export function fromPostgresJs(sql: PostgresJs): PgClient {
  return {
    async query(text, params) {
      const rows = await sql.unsafe(text, params);
      return { rows: [...rows] };
    },
    begin(fn) {
      return sql.begin((tx) => fn(fromPostgresJs(tx)));
    },
  };
}

/**
 * Open a Postgres connection with porsager's `postgres` driver, imported
 * lazily so it's only required when actually connecting (Hyperdrive binding at
 * runtime, or `EDGECMS_PG_URL` in conformance CI). Returns the PgClient plus a
 * `close` for teardown.
 */
export async function connectPostgres(
  connectionString: string,
): Promise<{ client: PgClient; close: () => Promise<void> }> {
  const mod = (await import("postgres" as string)) as { default: (url: string, opts?: unknown) => PostgresJs };
  const sql = mod.default(connectionString, { max: 1, prepare: false });
  return { client: fromPostgresJs(sql), close: () => sql.end() };
}
