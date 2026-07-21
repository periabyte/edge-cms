import type { CfClient } from "./client.js";

interface D1DatabaseInfo {
  uuid: string;
  name: string;
}

/** Idempotent: reuses an existing database with this name, or creates one. */
export async function ensureD1Database(client: CfClient, name: string): Promise<{ id: string; name: string }> {
  const existing = await client.request<D1DatabaseInfo[]>(
    "GET",
    `/accounts/${client.accountId}/d1/database?name=${encodeURIComponent(name)}`,
  );
  const found = existing.find((db) => db.name === name);
  if (found) return { id: found.uuid, name: found.name };

  const created = await client.request<D1DatabaseInfo>("POST", `/accounts/${client.accountId}/d1/database`, {
    body: { name },
  });
  return { id: created.uuid, name: created.name };
}

/** Deletes a D1 database by id (all its data is lost). */
export async function deleteD1Database(client: CfClient, id: string): Promise<void> {
  await client.request("DELETE", `/accounts/${client.accountId}/d1/database/${id}`);
}

interface D1QueryResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta: { duration: number };
}

/**
 * Applies migration SQL to the remote D1 database via the HTTP API,
 * statement by statement — the API has no cross-statement transactions, so
 * the caller's `_migrations` journal (see commands/deploy.ts) is what makes
 * a failure mid-migration resumable rather than silently half-applied.
 *
 * `tolerateDuplicateColumn` is for the best-effort `ALTER TABLE ADD COLUMN`
 * reconcile list (`systemReconcileStatements` — SQLite has no `ADD COLUMN IF
 * NOT EXISTS`): a "duplicate column name" failure just means an earlier
 * deploy already added it, so it's swallowed instead of aborting the rest of
 * the (already-idempotent) statements.
 */
export async function executeRemoteSql(
  client: CfClient,
  databaseId: string,
  statements: string[],
  opts?: { tolerateDuplicateColumn?: boolean },
): Promise<D1QueryResult[]> {
  const results: D1QueryResult[] = [];
  for (const sql of statements) {
    try {
      const [result] = await client.request<D1QueryResult[]>(
        "POST",
        `/accounts/${client.accountId}/d1/database/${databaseId}/query`,
        { body: { sql } },
      );
      results.push(result!);
    } catch (err) {
      if (opts?.tolerateDuplicateColumn && /duplicate column name/i.test((err as Error).message)) continue;
      throw err;
    }
  }
  return results;
}

/**
 * Count rows in the remote `users` table — used by deploy to tell whether the
 * root admin still needs to be created (a fresh deployment has zero users).
 */
export async function remoteUserCount(client: CfClient, databaseId: string): Promise<number> {
  const [result] = await client.request<D1QueryResult[]>(
    "POST",
    `/accounts/${client.accountId}/d1/database/${databaseId}/query`,
    { body: { sql: "SELECT count(*) AS n FROM users" } },
  );
  return Number(result?.results[0]?.n ?? 0);
}
