import { describe, expect, it } from "vitest";
import { collection, defineConfig, field, resolveConfig } from "@edgecms/config";
import { EdgeCMSError } from "@edgecms/core";
import { parseContentQuery } from "../src/query-params.js";
import { testResolved } from "./fixture.js";

const posts = testResolved().collections.find((c) => c.name === "posts")!;

const localizedPosts = resolveConfig(
  defineConfig({
    name: "x",
    collections: [
      collection("posts", { fields: { title: field.text() }, localization: ["en", "de"] }),
    ],
  }),
).collections[0]!;

describe("parseContentQuery", () => {
  it("parses filter[field]=value as eq", () => {
    const q = parseContentQuery(new URLSearchParams("filter[status]=published"), posts);
    expect(q.where).toEqual({ status: { eq: "published" } });
  });

  it("parses filter[field][op]=value", () => {
    const q = parseContentQuery(new URLSearchParams("filter[views][gte]=3"), posts);
    expect(q.where).toEqual({ views: { gte: 3 } });
  });

  it("coerces numeric field values", () => {
    const q = parseContentQuery(new URLSearchParams("filter[views][gte]=3"), posts);
    expect((q.where!.views as { gte: unknown }).gte).toBe(3);
  });

  it("parses in as a comma-separated list", () => {
    const q = parseContentQuery(new URLSearchParams("filter[status][in]=draft,published"), posts);
    expect((q.where!.status as { in: unknown }).in).toEqual(["draft", "published"]);
  });

  it("merges multiple operators on the same field", () => {
    const q = parseContentQuery(
      new URLSearchParams("filter[views][gte]=1&filter[views][lte]=5"),
      posts,
    );
    expect(q.where!.views).toEqual({ gte: 1, lte: 5 });
  });

  it("rejects an unsupported operator", () => {
    expect(() => parseContentQuery(new URLSearchParams("filter[views][bogus]=1"), posts)).toThrow(
      EdgeCMSError,
    );
  });

  it("parses sort with leading - for descending", () => {
    const q = parseContentQuery(new URLSearchParams("sort=-views,title"), posts);
    expect(q.sort).toEqual([
      { field: "views", dir: "desc" },
      { field: "title", dir: "asc" },
    ]);
  });

  it("parses limit, cursor, and populate", () => {
    const q = parseContentQuery(new URLSearchParams("limit=5&cursor=abc&populate=author,tags"), posts);
    expect(q.limit).toBe(5);
    expect(q.cursor).toBe("abc");
    expect(q.populate).toEqual(["author", "tags"]);
  });

  it("rejects a non-numeric limit", () => {
    expect(() => parseContentQuery(new URLSearchParams("limit=abc"), posts)).toThrow(EdgeCMSError);
  });

  it("passes through a locale param when the collection has no localization configured", () => {
    const q = parseContentQuery(new URLSearchParams("locale=fr"), posts);
    expect(q.locale).toBe("fr");
  });

  it("accepts a configured locale and rejects an unconfigured one", () => {
    expect(parseContentQuery(new URLSearchParams("locale=de"), localizedPosts).locale).toBe("de");
    expect(() => parseContentQuery(new URLSearchParams("locale=fr"), localizedPosts)).toThrow(
      EdgeCMSError,
    );
  });
});
