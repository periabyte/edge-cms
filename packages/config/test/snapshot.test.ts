import { describe, expect, it } from "vitest";
import {
  collection,
  defineConfig,
  field,
  parseSnapshot,
  resolveConfig,
  serializeSnapshot,
  snapshotOf,
} from "../src/index.js";
import { blogConfig } from "./fixtures.js";

describe("schema snapshot", () => {
  it("is byte-identical for the same logical schema regardless of declaration order", () => {
    const a = resolveConfig(blogConfig());

    // Same schema, collections and fields declared in a different order.
    const reordered = resolveConfig(
      defineConfig({
        name: "my-site",
        collections: [
          collection("tags", { fields: { name: field.text({ required: true, unique: true }) } }),
          collection("authors", { fields: { avatar: field.media(), name: field.text() } }),
          collection("posts", {
            fields: {
              status: field.select(["draft", "published"], { default: "draft" }),
              tags: field.relation("tags", { many: true }),
              author: field.relation("authors"),
              cover: field.media(),
              body: field.richText(),
              slug: field.slug({ from: "title", unique: true }),
              title: field.text({ required: true }),
            },
            versioning: true,
            localization: ["en", "de"],
            hooks: { afterPublish: ["revalidate-frontend"] },
          }),
        ],
      }),
    );

    expect(serializeSnapshot(snapshotOf(a))).toBe(serializeSnapshot(snapshotOf(reordered)));
  });

  it("round-trips through serialize/parse", () => {
    const snap = snapshotOf(resolveConfig(blogConfig()));
    const restored = parseSnapshot(serializeSnapshot(snap));
    expect(restored).toEqual(snap);
    expect(serializeSnapshot(restored)).toBe(serializeSnapshot(snap));
  });

  it("changes when a schema-affecting property changes", () => {
    const base = serializeSnapshot(snapshotOf(resolveConfig(blogConfig())));
    const changed = blogConfig();
    (changed.collections[0]!.fields as Record<string, unknown>).subtitle = field.text();
    expect(serializeSnapshot(snapshotOf(resolveConfig(changed)))).not.toBe(base);
  });

  it("ignores non-schema config (hooks, ai, ui)", () => {
    const base = serializeSnapshot(snapshotOf(resolveConfig(blogConfig())));
    const changed = blogConfig();
    changed.ai = { enabled: false };
    (changed.collections[0] as { hooks: object }).hooks = {};
    expect(serializeSnapshot(snapshotOf(resolveConfig(changed)))).toBe(base);
  });

  it("rejects unknown snapshot versions", () => {
    expect(() => parseSnapshot(JSON.stringify({ snapshotVersion: 99, collections: [] }))).toThrow(
      /version/,
    );
  });
});
