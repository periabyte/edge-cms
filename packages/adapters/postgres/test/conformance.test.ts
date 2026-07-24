import { describe } from "vitest";
import { conformanceSnapshot, runConformanceSuite } from "@kalayaan/adapter-conformance";
import { PostgresAdapter } from "../src/adapter.js";
import { connectPostgres } from "../src/driver.js";

/**
 * Full DatabaseAdapter conformance against a real Postgres, gated on
 * EDGECMS_PG_URL (a dockerized Postgres in CI, per the plan's §5 matrix). No
 * URL → skipped, so the suite is a no-op offline. Each test drops and
 * re-creates the conformance schema for isolation.
 */
const url = process.env.EDGECMS_PG_URL;

if (!url) {
  describe.skip("conformance: postgres (set EDGECMS_PG_URL to run)", () => {});
} else {
  const { client, close } = await connectPostgres(url);
  const snapshot = conformanceSnapshot();

  runConformanceSuite("postgres", async () => {
    for (const name of ["posts_tags", "posts", "authors", "tags"]) {
      await client.query(`DROP TABLE IF EXISTS "${name}" CASCADE`, []);
    }
    return { adapter: new PostgresAdapter(client, snapshot) };
  });

  // Best-effort teardown; Vitest closes the process regardless.
  process.on("beforeExit", () => void close());
}
