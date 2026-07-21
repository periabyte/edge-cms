import { describe, expect, it } from "vitest";
import { EdgeCMSError } from "@edgecms/core";
import { buildFind as _buildFind, decodeCursor, encodeCursor } from "../src/query-builder.js";
import { postsCollection, testDialect } from "./fixture.js";

const posts = postsCollection();
const buildFind = (query: Parameters<typeof _buildFind>[0]) =>
  _buildFind(query, posts, testDialect);

describe("buildFind", () => {
  it("defaults to sort by created_at desc, id tiebreak, limit 20, current locale", () => {
    const compiled = buildFind({ collection: "posts" });
    expect(compiled.sql).toBe(
      `SELECT * FROM "posts" WHERE "locale" = ? ORDER BY "created_at" DESC, "id" DESC LIMIT 21`,
    );
    expect(compiled.params).toEqual(["en"]);
    expect(compiled.limit).toBe(20);
  });

  it("caps limit at MAX_LIMIT", () => {
    expect(buildFind({ collection: "posts", limit: 500 }).limit).toBe(100);
  });

  it("compiles eq shorthand and explicit operators", () => {
    const compiled = buildFind({ collection: "posts", where: { views: { gte: 3 }, title: "Hi" } });
    expect(compiled.sql).toContain(`"views" >= ?`);
    expect(compiled.sql).toContain(`"title" = ?`);
    expect(compiled.params).toEqual([3, "Hi", "en"]);
  });

  it("maps relation and media fields to their _id column", () => {
    const compiled = buildFind({ collection: "posts", where: { author: "a1" } });
    expect(compiled.sql).toContain(`"author_id" = ?`);
  });

  it("compiles contains to an escaped LIKE", () => {
    const compiled = buildFind({ collection: "posts", where: { title: { contains: "100%" } } });
    expect(compiled.sql).toContain(`"title" LIKE ? ESCAPE '\\'`);
    expect(compiled.params[0]).toBe("%100\\%%");
  });

  it("compiles in with a non-empty array", () => {
    const compiled = buildFind({ collection: "posts", where: { views: { in: [1, 2, 3] } } });
    expect(compiled.sql).toContain(`"views" IN (?, ?, ?)`);
    expect(compiled.params).toEqual([1, 2, 3, "en"]);
  });

  it("rejects an empty in array", () => {
    expect(() => buildFind({ collection: "posts", where: { views: { in: [] } } })).toThrow(
      EdgeCMSError,
    );
  });

  it("compiles or groups", () => {
    const compiled = buildFind({ collection: "posts", or: [{ views: 1 }, { views: 2 }] });
    expect(compiled.sql).toContain(`("views" = ? OR "views" = ?)`);
  });

  it("rejects filtering by a many-relation", () => {
    expect(() => buildFind({ collection: "posts", where: { tags: "t1" } })).toThrow(
      /many-relation/,
    );
  });

  it("rejects sorting by a relation field", () => {
    expect(() =>
      buildFind({ collection: "posts", sort: [{ field: "author", dir: "asc" }] }),
    ).toThrow(/Cannot sort/);
  });

  it("rejects an unknown filter field", () => {
    expect(() => buildFind({ collection: "posts", where: { nope: 1 } })).toThrow(
      /unknown field/,
    );
  });

  it("respects an explicit locale", () => {
    const compiled = buildFind({ collection: "posts", locale: "de" });
    expect(compiled.params).toContain("de");
  });

  it("encodes a cursor predicate for multi-column sort", () => {
    const cursor = encodeCursor([5, "abc"]);
    const compiled = buildFind({ collection: "posts", sort: [{ field: "views", dir: "asc" }], cursor });
    expect(compiled.sql).toContain(`(("views" > ?) OR ("views" = ? AND "id" > ?))`);
    expect(compiled.params).toEqual(["en", 5, 5, "abc"]);
  });
});

describe("cursor encode/decode", () => {
  it("round-trips arbitrary JSON-safe values", () => {
    expect(decodeCursor(encodeCursor([1, "a", null]))).toEqual([1, "a", null]);
  });

  it("is URL-safe (no +, /, =)", () => {
    const cursor = encodeCursor(["value/with+chars=="]);
    expect(cursor).not.toMatch(/[+/=]/);
  });

  it("throws EdgeCMSError on garbage input", () => {
    expect(() => decodeCursor("not-valid-base64!!!")).toThrow(EdgeCMSError);
  });
});
