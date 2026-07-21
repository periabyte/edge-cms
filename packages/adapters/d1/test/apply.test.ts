import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { field } from "@edgecms/config";
import { SYSTEM_TABLE_DDL } from "../src/system-tables.js";
import { blogConfig, ddlBetween } from "./helpers.js";

/**
 * Applies generated DDL to a real SQLite database (node:sqlite — the same
 * engine D1 runs on) and asserts the resulting schema. The D1-binding
 * integration path is covered by the adapter tests under vitest-pool-workers.
 */

function apply(db: DatabaseSync, statements: { sql: string }[]) {
  for (const s of statements) db.exec(s.sql);
}

function columns(db: DatabaseSync, table: string): Record<string, { type: string; notnull: number }> {
  const rows = db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as {
    name: string;
    type: string;
    notnull: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.name, { type: r.type, notnull: r.notnull }]));
}

describe("DDL applies to real SQLite", () => {
  it("system tables + initial blog migration", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    apply(db, SYSTEM_TABLE_DDL.map((sql) => ({ sql })));
    apply(db, ddlBetween(null, blogConfig()));

    const posts = columns(db, "posts");
    expect(posts.id).toEqual({ type: "TEXT", notnull: 0 });
    expect(posts.title).toEqual({ type: "TEXT", notnull: 1 });
    expect(posts.entity_id?.notnull).toBe(1);
    expect(posts.locale?.notnull).toBe(1);
    expect(posts.author_id).toBeDefined();
    expect(posts.cover_id).toBeDefined();
    expect(Object.keys(columns(db, "posts_tags"))).toEqual(["owner_id", "ref_id", "sort"]);

    // Constraints hold: CHECK on select, UNIQUE(slug, locale), FK on author.
    const now = Date.now();
    const insert = db.prepare(
      `INSERT INTO posts (id, entity_id, locale, title, slug, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run("p1", "e1", "en", "Hello", "hello", "draft", now, now);
    insert.run("p2", "e1", "de", "Hallo", "hello", "draft", now, now); // same slug, other locale ok
    expect(() => insert.run("p3", "e2", "en", "Dup", "hello", "draft", now, now)).toThrow(/UNIQUE/);
    expect(() => insert.run("p4", "e3", "en", "Bad", "bad", "archived", now, now)).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO posts (id, entity_id, locale, title, slug, status, author_id, created_at, updated_at)
           VALUES ('p5', 'e5', 'en', 'X', 'x', 'draft', 'ghost-author', ?, ?)`,
        )
        .run(now, now),
    ).toThrow(/FOREIGN KEY/);
  });

  it("incremental migration: add column, then drop via rebuild keeps data", () => {
    const db = new DatabaseSync(":memory:");
    apply(db, SYSTEM_TABLE_DDL.map((sql) => ({ sql })));
    apply(db, ddlBetween(null, blogConfig()));

    const now = Date.now();
    db.prepare(
      `INSERT INTO posts (id, entity_id, locale, title, slug, body, status, created_at, updated_at)
       VALUES ('p1', 'e1', 'en', 'Keep me', 'keep-me', 'old body', 'published', ?, ?)`,
    ).run(now, now);

    // Step 1: add a field.
    const withSubtitle = blogConfig();
    (withSubtitle.collections[0]!.fields as Record<string, unknown>).subtitle = field.text();
    apply(db, ddlBetween(blogConfig(), withSubtitle));
    expect(columns(db, "posts").subtitle).toBeDefined();

    // Step 2: drop the body field (rebuild path).
    const withoutBody = withSubtitle;
    delete (withoutBody.collections[0]!.fields as Record<string, unknown>).body;
    const prev = blogConfig();
    (prev.collections[0]!.fields as Record<string, unknown>).subtitle = field.text();
    apply(db, ddlBetween(prev, withoutBody));

    expect(columns(db, "posts").body).toBeUndefined();
    const row = db.prepare(`SELECT title, slug, status FROM posts WHERE id = 'p1'`).get() as {
      title: string;
      slug: string;
      status: string;
    };
    expect(row).toEqual({ title: "Keep me", slug: "keep-me", status: "published" });

    // Unique index survived the rebuild.
    expect(() =>
      db
        .prepare(
          `INSERT INTO posts (id, entity_id, locale, title, slug, status, created_at, updated_at)
           VALUES ('p9', 'e9', 'en', 'Dup', 'keep-me', 'draft', ?, ?)`,
        )
        .run(now, now),
    ).toThrow(/UNIQUE/);
  });

  it("enabling localization backfills via rebuild", () => {
    const db = new DatabaseSync(":memory:");
    apply(db, ddlBetween(null, blogConfig()));
    const now = Date.now();
    db.prepare(`INSERT INTO tags (id, name, created_at, updated_at) VALUES ('t1', 'go', ?, ?)`).run(
      now,
      now,
    );

    const localized = blogConfig();
    (localized.collections[2] as { localization?: string[] }).localization = ["en", "de"];
    apply(db, ddlBetween(blogConfig(), localized));

    const cols = columns(db, "tags");
    expect(cols.locale).toBeDefined();
    const row = db.prepare(`SELECT name, locale FROM tags WHERE id = 't1'`).get() as {
      name: string;
      locale: string;
    };
    expect(row).toEqual({ name: "go", locale: "en" });
  });
});
