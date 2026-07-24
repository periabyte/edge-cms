import {
  collection,
  defineConfig,
  field,
  resolveConfig,
  snapshotOf,
  type SnapshotCollection,
} from "@kalayaan/config";

export function postsCollection(): SnapshotCollection {
  const snap = snapshotOf(
    resolveConfig(
      defineConfig({
        name: "x",
        collections: [
          collection("posts", {
            fields: {
              title: field.text({ required: true }),
              slug: field.slug({ from: "title", unique: true }),
              views: field.number({ integer: true }),
              tags: field.relation("tags", { many: true }),
              author: field.relation("authors"),
            },
            localization: ["en", "de"],
          }),
          collection("tags", { fields: { name: field.text() } }),
          collection("authors", { fields: { name: field.text() } }),
        ],
      }),
    ),
  );
  return snap.collections.find((c) => c.name === "posts")!;
}

import type { SqlDialect } from "../src/dialect.js";

/**
 * A minimal SQLite-flavoured dialect for query-builder unit tests: double-quote
 * identifiers, `?` placeholders, LIKE, boolean → 0/1. Mirrors @kalayaan/adapter-d1's
 * sqliteDialect without importing it (relational must not depend on d1).
 */
export const testDialect: SqlDialect = {
  id: "sqlite",
  quoteId: (id) => `"${id.replaceAll('"', '""')}"`,
  quoteLiteral: (v) => `'${v.replaceAll("'", "''")}'`,
  renderParams: (sql) => sql,
  likeOperator: "LIKE",
  encodeParam: (v) => (typeof v === "boolean" ? (v ? 1 : 0) : v),
  decodeBoolean: (v) => v === 1 || v === true,
  timestampType: "INTEGER",
  idType: "TEXT",
  supportsAlterColumn: false,
  ddlTransactional: false,
  systemTableDDL: () => [],
  columnDefinition: () => null,
};
