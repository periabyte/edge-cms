import { describe, expect, it } from "vitest";
import { field } from "@edgecms/config";
import { postgresDialect } from "../src/dialect.js";
import { blogConfig, ddlBetween } from "./helpers.js";

describe("postgres DDL", () => {
  it("initial migration uses BIGINT timestamps and native BOOLEAN", () => {
    const sql = ddlBetween(null, blogConfig())
      .map((s) => s.sql)
      .join("\n");
    expect(sql).toContain(`"created_at" BIGINT NOT NULL`);
    expect(sql).toContain(`"published_at" BIGINT`);
    expect(sql).toContain(`"featured" BOOLEAN DEFAULT false`);
    expect(sql).toContain(`"views" BIGINT DEFAULT 0`);
    // richText stays TEXT so the shared JSON round-trip is engine-neutral.
    expect(sql).toContain(`"body" TEXT`);
    // Locale-aware unique index, same as SQLite.
    expect(sql).toContain(`CREATE UNIQUE INDEX "ux_posts_slug" ON "posts" ("slug", "locale")`);
  });

  it("adds a plain column with ALTER TABLE ADD COLUMN", () => {
    const next = blogConfig();
    (next.collections[0]!.fields as Record<string, unknown>).subtitle = field.text();
    expect(ddlBetween(blogConfig(), next)).toEqual([
      { sql: `ALTER TABLE "posts" ADD COLUMN "subtitle" TEXT;`, destructive: false },
    ]);
  });

  it("drops a column with ALTER TABLE DROP COLUMN — no copy-rename", () => {
    const next = blogConfig();
    delete (next.collections[0]!.fields as Record<string, unknown>).body;
    const statements = ddlBetween(blogConfig(), next);
    expect(statements).toEqual([
      { sql: `ALTER TABLE "posts" DROP COLUMN "body";`, destructive: true },
    ]);
  });

  it("dropping a many-relation drops only the join table", () => {
    const next = blogConfig();
    delete (next.collections[0]!.fields as Record<string, unknown>).tags;
    expect(ddlBetween(blogConfig(), next)).toEqual([
      { sql: `DROP TABLE "posts_tags";`, destructive: true },
    ]);
  });

  it("turning on localization adds columns and backfills entity_id", () => {
    const before = blogConfig();
    delete before.collections[0]!.localization;
    const statements = ddlBetween(before, blogConfig()).map((s) => s.sql);
    const joined = statements.join("\n");
    expect(joined).toContain(`ALTER TABLE "posts" ADD COLUMN "entity_id" TEXT;`);
    expect(joined).toContain(`ALTER TABLE "posts" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';`);
    expect(joined).toContain(`UPDATE "posts" SET "entity_id" = "id" WHERE "entity_id" IS NULL;`);
    // Never rebuilds via a temp table.
    expect(joined).not.toContain(`_new_posts`);
  });

  it("renders ? placeholders as $1..$n and uses ILIKE", () => {
    expect(postgresDialect.renderParams(`SELECT * FROM "p" WHERE "a" = ? AND "b" ILIKE ?`)).toBe(
      `SELECT * FROM "p" WHERE "a" = $1 AND "b" ILIKE $2`,
    );
    expect(postgresDialect.likeOperator).toBe("ILIKE");
  });

  it("keeps booleans native in encodeParam", () => {
    expect(postgresDialect.encodeParam(true)).toBe(true);
    expect(postgresDialect.encodeParam(false)).toBe(false);
    expect(postgresDialect.decodeBoolean(true)).toBe(true);
    expect(postgresDialect.decodeBoolean("t")).toBe(true);
  });
});
