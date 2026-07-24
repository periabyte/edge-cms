import { describe, expect, it } from "vitest";
import { field } from "@kalayaan/config";
import { mysqlDialect } from "../src/dialect.js";
import { blogConfig, ddlBetween } from "./helpers.js";

describe("mysql DDL", () => {
  it("uses backtick identifiers, VARCHAR keys, TINYINT booleans, BIGINT timestamps", () => {
    const sql = ddlBetween(null, blogConfig())
      .map((s) => s.sql)
      .join("\n");
    expect(sql).toContain("`id` VARCHAR(255) PRIMARY KEY");
    expect(sql).toContain("`entity_id` VARCHAR(255) NOT NULL");
    expect(sql).toContain("`title` VARCHAR(255) NOT NULL");
    expect(sql).toContain("`body` TEXT");
    expect(sql).toContain("`featured` TINYINT(1) DEFAULT 0");
    expect(sql).toContain("`views` BIGINT DEFAULT 0");
    expect(sql).toContain("`created_at` BIGINT NOT NULL");
    expect(sql).toContain("CREATE UNIQUE INDEX `ux_posts_slug` ON `posts` (`slug`, `locale`)");
  });

  it("adds and drops columns with ALTER TABLE (no copy-rename)", () => {
    const added = blogConfig();
    (added.collections[0]!.fields as Record<string, unknown>).subtitle = field.text();
    expect(ddlBetween(blogConfig(), added)).toEqual([
      { sql: "ALTER TABLE `posts` ADD COLUMN `subtitle` VARCHAR(255);", destructive: false },
    ]);

    const dropped = blogConfig();
    delete (dropped.collections[0]!.fields as Record<string, unknown>).body;
    expect(ddlBetween(blogConfig(), dropped)).toEqual([
      { sql: "ALTER TABLE `posts` DROP COLUMN `body`;", destructive: true },
    ]);
  });

  it("encodes booleans as 1/0 and decodes back", () => {
    expect(mysqlDialect.encodeParam(true)).toBe(1);
    expect(mysqlDialect.encodeParam(false)).toBe(0);
    expect(mysqlDialect.decodeBoolean(1)).toBe(true);
    expect(mysqlDialect.decodeBoolean(0)).toBe(false);
  });

  it("keeps ? placeholders unchanged", () => {
    expect(mysqlDialect.renderParams("SELECT * FROM `p` WHERE `a` = ?")).toBe(
      "SELECT * FROM `p` WHERE `a` = ?",
    );
  });
});
