import { env } from "cloudflare:test";
import { runConformanceSuite, conformanceSnapshot } from "@kalayaan/adapter-conformance";
import { D1Adapter } from "../../src/adapter.js";

interface TestEnv {
  DB: D1Database;
}

/**
 * Runs the shared conformance suite against a real D1 binding under
 * miniflare. Each test gets a fresh schema: DROP+CREATE is fast enough on
 * an in-memory D1 database that per-test isolation via beforeEach is fine.
 */
runConformanceSuite("d1", async () => {
  const db = (env as unknown as TestEnv).DB;
  for (const name of ["posts_tags", "posts", "authors", "tags"]) {
    await db.exec(`DROP TABLE IF EXISTS "${name}"`).catch(() => undefined);
  }
  return { adapter: new D1Adapter(db, conformanceSnapshot()) };
});
