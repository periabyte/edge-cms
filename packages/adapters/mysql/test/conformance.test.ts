import { describe } from "vitest";
import { conformanceSnapshot, runConformanceSuite } from "@kalayaan/adapter-conformance";
import { MysqlAdapter } from "../src/adapter.js";
import { connectMysql } from "../src/driver.js";

/**
 * Full DatabaseAdapter conformance against a real MySQL, gated on
 * EDGECMS_MYSQL_URL (a dockerized MySQL in CI). No URL → skipped.
 */
const url = process.env.EDGECMS_MYSQL_URL;

if (!url) {
  describe.skip("conformance: mysql (set EDGECMS_MYSQL_URL to run)", () => {});
} else {
  const { client, close } = await connectMysql(url);
  const snapshot = conformanceSnapshot();

  runConformanceSuite("mysql", async () => {
    await client.query("SET FOREIGN_KEY_CHECKS=0", []);
    for (const name of ["posts_tags", "posts", "authors", "tags"]) {
      await client.query(`DROP TABLE IF EXISTS \`${name}\``, []);
    }
    await client.query("SET FOREIGN_KEY_CHECKS=1", []);
    return { adapter: new MysqlAdapter(client, snapshot) };
  });

  process.on("beforeExit", () => void close());
}
