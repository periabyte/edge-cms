import {
  collection,
  defineConfig,
  diffSnapshots,
  field,
  resolveConfig,
  snapshotOf,
  type EdgeCMSConfig,
  type SchemaSnapshot,
} from "@kalayaan/config";
import { emitDDL, type SqlStatement } from "@kalayaan/adapter-relational";
import { postgresDialect } from "../src/dialect.js";

export function blogConfig(): EdgeCMSConfig {
  return defineConfig({
    name: "my-site",
    collections: [
      collection("posts", {
        fields: {
          title: field.text({ required: true }),
          slug: field.slug({ from: "title", unique: true }),
          body: field.richText(),
          cover: field.media(),
          author: field.relation("authors"),
          tags: field.relation("tags", { many: true }),
          status: field.select(["draft", "published"], { default: "draft" }),
          featured: field.boolean({ default: false }),
          views: field.number({ integer: true, default: 0 }),
        },
        versioning: true,
        localization: ["en", "de"],
      }),
      collection("authors", { fields: { name: field.text(), avatar: field.media() } }),
      collection("tags", { fields: { name: field.text({ required: true, unique: true }) } }),
    ],
  });
}

export function snapshotFor(config: EdgeCMSConfig): SchemaSnapshot {
  return snapshotOf(resolveConfig(config));
}

export function ddlBetween(prev: EdgeCMSConfig | null, next: EdgeCMSConfig): SqlStatement[] {
  const prevSnap = prev ? snapshotFor(prev) : null;
  const nextSnap = snapshotFor(next);
  return emitDDL(postgresDialect, diffSnapshots(prevSnap, nextSnap), nextSnap, prevSnap);
}
