import type { MysqlClient } from "./adapter.js";

/** Structural type for a mysql2/promise pool, so no build-time driver dep. */
interface Mysql2Pool {
  query(text: string, params?: unknown[]): Promise<[unknown, unknown]>;
  getConnection(): Promise<Mysql2Connection>;
  end(): Promise<void>;
}
interface Mysql2Connection {
  query(text: string, params?: unknown[]): Promise<[unknown, unknown]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

function rowsOf(result: [unknown, unknown]): Record<string, unknown>[] {
  const first = result[0];
  return Array.isArray(first) ? (first as Record<string, unknown>[]) : [];
}

/** Wrap a mysql2/promise pool as a MysqlClient. */
export function fromMysql2(pool: Mysql2Pool): MysqlClient {
  return {
    async query(text, params) {
      return { rows: rowsOf(await pool.query(text, params)) };
    },
    async begin(fn) {
      const conn = await pool.getConnection();
      await conn.beginTransaction();
      try {
        const result = await fn({
          async query(text, params) {
            return { rows: rowsOf(await conn.query(text, params)) };
          },
          begin: (inner) => inner(this),
        });
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback().catch(() => undefined);
        throw err;
      } finally {
        conn.release();
      }
    },
  };
}

/**
 * Open a MySQL pool with mysql2, imported lazily so the driver is only
 * required when actually connecting (Hyperdrive at runtime, EDGECMS_MYSQL_URL
 * in conformance CI).
 */
export async function connectMysql(
  connectionString: string,
): Promise<{ client: MysqlClient; close: () => Promise<void> }> {
  const mod = (await import("mysql2/promise" as string)) as {
    createPool: (url: string | { uri: string }) => Mysql2Pool;
  };
  const pool = mod.createPool({ uri: connectionString });
  return { client: fromMysql2(pool), close: () => pool.end() };
}
