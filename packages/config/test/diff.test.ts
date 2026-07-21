import { describe, expect, it } from "vitest";
import {
  diffSnapshots,
  field,
  isDestructive,
  resolveConfig,
  snapshotOf,
} from "../src/index.js";
import { blogConfig } from "./fixtures.js";

const snap = (mutate?: (c: ReturnType<typeof blogConfig>) => void) => {
  const config = blogConfig();
  mutate?.(config);
  return snapshotOf(resolveConfig(config));
};

describe("diffSnapshots", () => {
  it("emits create_collection for every collection on first migration", () => {
    const changes = diffSnapshots(null, snap());
    expect(changes.map((c) => c.kind)).toEqual([
      "create_collection",
      "create_collection",
      "create_collection",
    ]);
  });

  it("is empty for identical snapshots", () => {
    expect(diffSnapshots(snap(), snap())).toEqual([]);
  });

  it("detects added and dropped fields", () => {
    const changes = diffSnapshots(
      snap(),
      snap((c) => {
        const fields = c.collections[0]!.fields as Record<string, unknown>;
        fields.subtitle = field.text();
        delete fields.cover;
      }),
    );
    expect(changes).toEqual([
      expect.objectContaining({ kind: "add_field", collection: "posts" }),
      expect.objectContaining({ kind: "drop_field", collection: "posts", field: "cover" }),
    ]);
    expect(isDestructive(changes[0]!)).toBe(false);
    expect(isDestructive(changes[1]!)).toBe(true);
  });

  it("detects altered fields and flags type changes destructive", () => {
    const changes = diffSnapshots(
      snap(),
      snap((c) => {
        (c.collections[0]!.fields as Record<string, unknown>).body = field.text();
      }),
    );
    expect(changes).toEqual([
      expect.objectContaining({ kind: "alter_field", collection: "posts" }),
    ]);
    expect(isDestructive(changes[0]!)).toBe(true);
  });

  it("flags select-option narrowing destructive but widening safe", () => {
    const widened = diffSnapshots(
      snap(),
      snap((c) => {
        (c.collections[0]!.fields as Record<string, unknown>).status = field.select(
          ["draft", "published", "archived"],
          { default: "draft" },
        );
      }),
    );
    expect(isDestructive(widened[0]!)).toBe(false);

    const narrowed = diffSnapshots(
      snap(),
      snap((c) => {
        (c.collections[0]!.fields as Record<string, unknown>).status = field.select(["draft"], {
          default: "draft",
        });
      }),
    );
    expect(isDestructive(narrowed[0]!)).toBe(true);
  });

  it("detects localization changes; removing a locale is destructive", () => {
    const added = diffSnapshots(
      snap(),
      snap((c) => {
        (c.collections[0] as { localization: string[] }).localization = ["en", "de", "fr"];
      }),
    );
    expect(added).toEqual([
      expect.objectContaining({ kind: "set_localization", collection: "posts" }),
    ]);
    expect(isDestructive(added[0]!)).toBe(false);

    const removed = diffSnapshots(
      snap(),
      snap((c) => {
        (c.collections[0] as { localization: string[] }).localization = ["en"];
      }),
    );
    expect(isDestructive(removed[0]!)).toBe(true);
  });

  it("detects dropped collections as destructive", () => {
    const changes = diffSnapshots(
      snap(),
      snap((c) => {
        c.collections = c.collections.filter((x) => x.name !== "tags") as never;
        // posts.tags relation would dangle — drop it too for a valid config
        delete (c.collections.find((x) => x.name === "posts")!.fields as Record<string, unknown>)
          .tags;
      }),
    );
    const drop = changes.find((c) => c.kind === "drop_collection");
    expect(drop).toBeDefined();
    expect(isDestructive(drop!)).toBe(true);
  });
});
