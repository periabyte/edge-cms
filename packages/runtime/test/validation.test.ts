import { describe, expect, it } from "vitest";
import { collectionWriteSchema } from "../src/validation.js";
import { testResolved } from "./fixture.js";

const posts = testResolved().collections.find((c) => c.name === "posts")!;

describe("collectionWriteSchema", () => {
  it("requires required fields on create", () => {
    const schema = collectionWriteSchema(posts, { partial: false });
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ title: "Hi", slug: "hi" }).success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    const schema = collectionWriteSchema(posts, { partial: false });
    const result = schema.safeParse({ title: "Hi", slug: "hi", bogus: 1 });
    expect(result.success).toBe(false);
  });

  it("enforces select options", () => {
    const schema = collectionWriteSchema(posts, { partial: false });
    expect(schema.safeParse({ title: "Hi", slug: "hi", status: "archived" }).success).toBe(false);
    expect(schema.safeParse({ title: "Hi", slug: "hi", status: "published" }).success).toBe(true);
  });

  it("allows partial bodies for updates", () => {
    const schema = collectionWriteSchema(posts, { partial: true });
    expect(schema.safeParse({ views: 5 }).success).toBe(true);
  });

  it("accepts published_at as a nullable epoch-ms number", () => {
    const schema = collectionWriteSchema(posts, { partial: true });
    expect(schema.safeParse({ published_at: 123 }).success).toBe(true);
    expect(schema.safeParse({ published_at: null }).success).toBe(true);
  });
});
