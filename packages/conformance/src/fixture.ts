import {
  collection,
  defineConfig,
  diffSnapshots,
  field,
  resolveConfig,
  snapshotOf,
  type EdgeCMSConfig,
  type SchemaSnapshot,
} from "@edgecms/config";
import type { DatabaseAdapter } from "@edgecms/core";

export function conformanceConfig(): EdgeCMSConfig {
  return defineConfig({
    name: "conformance",
    collections: [
      collection("posts", {
        fields: {
          title: field.text({ required: true }),
          slug: field.slug({ from: "title", unique: true }),
          body: field.richText(),
          // NB: no `media` field here — the `media` system table is adapter
          // plumbing (seeded separately per adapter, see M6), and the
          // conformance suite only exercises the public DatabaseAdapter
          // contract against user collections.
          author: field.relation("authors"),
          tags: field.relation("tags", { many: true }),
          status: field.select(["draft", "published"], { default: "draft" }),
          views: field.number({ integer: true, default: 0 }),
        },
        localization: ["en", "de"],
      }),
      collection("authors", { fields: { name: field.text({ required: true }) } }),
      collection("tags", { fields: { name: field.text({ required: true, unique: true }) } }),
    ],
  });
}

export function conformanceSnapshot(): SchemaSnapshot {
  return snapshotOf(resolveConfig(conformanceConfig()));
}

/** Runs the initial migration for the conformance schema against a fresh adapter. */
export async function seedSchema(adapter: DatabaseAdapter): Promise<void> {
  const next = conformanceSnapshot();
  const plan = await adapter.planMigration(diffSnapshots(null, next), next, null);
  await adapter.applyMigration(plan);
}
