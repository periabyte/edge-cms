import { beforeEach, describe, expect, it } from "vitest";
import { EdgeCMSError, type DatabaseAdapter } from "@kalayaan/core";
import { seedSchema } from "./fixture.js";

export interface ConformanceContext {
  adapter: DatabaseAdapter;
}

/**
 * The scenario matrix run against every DatabaseAdapter implementation.
 * `setup` returns a fresh, unmigrated adapter for the conformance schema;
 * this suite seeds it before each test.
 */
export function runConformanceSuite(name: string, setup: () => Promise<ConformanceContext>): void {
  describe(`conformance: ${name}`, () => {
    let ctx: ConformanceContext;

    beforeEach(async () => {
      ctx = await setup();
      await seedSchema(ctx.adapter);
    });

    describe("CRUD", () => {
      it("creates a document with generated id and timestamps", async () => {
        const author = await ctx.adapter.create("authors", { name: "Ada" });
        expect(author.id).toBeTruthy();
        expect(author.name).toBe("Ada");
        expect(typeof author.created_at).toBe("number");
        expect(author.updated_at).toBe(author.created_at);
      });

      it("round-trips every scalar field type", async () => {
        const author = await ctx.adapter.create("authors", { name: "Ada" });
        const post = await ctx.adapter.create("posts", {
          title: "Hello",
          slug: "hello",
          body: { blocks: ["hi"] },
          status: "draft",
          views: 3,
          author: author.id,
          locale: "en",
        });
        expect(post.title).toBe("Hello");
        expect(post.body).toEqual({ blocks: ["hi"] });
        expect(post.status).toBe("draft");
        expect(post.views).toBe(3);
        expect(post.author).toBe(author.id);
      });

      it("applies field defaults on create", async () => {
        const author = await ctx.adapter.create("authors", { name: "Ada" });
        const post = await ctx.adapter.create("posts", {
          title: "X",
          slug: "x",
          author: author.id,
          locale: "en",
        });
        expect(post.status).toBe("draft");
        expect(post.views).toBe(0);
      });

      it("finds by id and by slug", async () => {
        const created = await ctx.adapter.create("posts", {
          title: "X",
          slug: "x-slug",
          locale: "en",
        });
        expect((await ctx.adapter.findOne({ collection: "posts", id: created.id }))?.id).toBe(
          created.id,
        );
        expect(
          (await ctx.adapter.findOne({ collection: "posts", slug: "x-slug", locale: "en" }))?.id,
        ).toBe(created.id);
      });

      it("returns null from findOne when missing", async () => {
        expect(await ctx.adapter.findOne({ collection: "posts", id: "missing" })).toBeNull();
      });

      it("updates scalar fields and bumps updated_at without touching others", async () => {
        const created = await ctx.adapter.create("posts", {
          title: "X",
          slug: "x",
          views: 1,
          locale: "en",
        });
        await new Promise((r) => setTimeout(r, 2));
        const updated = await ctx.adapter.update(
          { collection: "posts", id: created.id },
          { views: 2 },
        );
        expect(updated.views).toBe(2);
        expect(updated.title).toBe("X");
        expect(updated.updated_at).toBeGreaterThan(created.updated_at as number);
      });

      it("throws not_found updating a missing document", async () => {
        await expect(
          ctx.adapter.update({ collection: "posts", id: "missing" }, { views: 1 }),
        ).rejects.toMatchObject({ code: "not_found" });
      });

      it("deletes a document", async () => {
        const created = await ctx.adapter.create("authors", { name: "Ada" });
        await ctx.adapter.delete({ collection: "authors", id: created.id });
        expect(await ctx.adapter.findOne({ collection: "authors", id: created.id })).toBeNull();
      });

      it("enforces unique constraints", async () => {
        await ctx.adapter.create("tags", { name: "go" });
        await expect(ctx.adapter.create("tags", { name: "go" })).rejects.toBeTruthy();
      });
    });

    describe("relations", () => {
      it("stores and returns many-relation ids in insertion order", async () => {
        const a = await ctx.adapter.create("tags", { name: "a" });
        const b = await ctx.adapter.create("tags", { name: "b" });
        const post = await ctx.adapter.create("posts", {
          title: "X",
          slug: "x",
          tags: [a.id, b.id],
          locale: "en",
        });
        expect(post.tags).toEqual([a.id, b.id]);
        const fetched = await ctx.adapter.findOne({ collection: "posts", id: post.id });
        expect(fetched?.tags).toEqual([a.id, b.id]);
      });

      it("replaces many-relation membership on update", async () => {
        const a = await ctx.adapter.create("tags", { name: "a" });
        const b = await ctx.adapter.create("tags", { name: "b" });
        const post = await ctx.adapter.create("posts", {
          title: "X",
          slug: "x",
          tags: [a.id],
          locale: "en",
        });
        const updated = await ctx.adapter.update(
          { collection: "posts", id: post.id },
          { tags: [b.id] },
        );
        expect(updated.tags).toEqual([b.id]);
      });

      it("populates a single relation and a many-relation", async () => {
        const author = await ctx.adapter.create("authors", { name: "Ada" });
        const tag = await ctx.adapter.create("tags", { name: "go" });
        const post = await ctx.adapter.create("posts", {
          title: "X",
          slug: "x",
          author: author.id,
          tags: [tag.id],
          locale: "en",
        });
        const page = await ctx.adapter.find({
          collection: "posts",
          where: { id: post.id },
          populate: ["author", "tags"],
        });
        expect(page.docs[0]?.author).toMatchObject({ id: author.id, name: "Ada" });
        expect(page.docs[0]?.tags).toEqual([expect.objectContaining({ id: tag.id, name: "go" })]);
      });
    });

    describe("filtering, sorting, pagination", () => {
      beforeEach(async () => {
        for (let i = 0; i < 5; i++) {
          await ctx.adapter.create("posts", {
            title: `Post ${i}`,
            slug: `post-${i}`,
            status: i % 2 === 0 ? "published" : "draft",
            views: i,
            locale: "en",
          });
        }
      });

      it("filters with eq shorthand and explicit ops", async () => {
        const eq = await ctx.adapter.find({ collection: "posts", where: { status: "published" } });
        expect(eq.docs).toHaveLength(3);
        const gte = await ctx.adapter.find({ collection: "posts", where: { views: { gte: 3 } } });
        expect(gte.docs.map((d) => d.views).sort()).toEqual([3, 4]);
      });

      it("filters with contains", async () => {
        const page = await ctx.adapter.find({ collection: "posts", where: { title: { contains: "3" } } });
        expect(page.docs).toHaveLength(1);
        expect(page.docs[0]?.title).toBe("Post 3");
      });

      it("sorts ascending and descending", async () => {
        const asc = await ctx.adapter.find({ collection: "posts", sort: [{ field: "views", dir: "asc" }] });
        expect(asc.docs.map((d) => d.views)).toEqual([0, 1, 2, 3, 4]);
        const desc = await ctx.adapter.find({ collection: "posts", sort: [{ field: "views", dir: "desc" }] });
        expect(desc.docs.map((d) => d.views)).toEqual([4, 3, 2, 1, 0]);
      });

      it("paginates via cursor with no gaps or duplicates", async () => {
        const seen: unknown[] = [];
        let cursor: string | null | undefined;
        do {
          const page = await ctx.adapter.find({
            collection: "posts",
            sort: [{ field: "views", dir: "asc" }],
            limit: 2,
            ...(cursor && { cursor }),
          });
          seen.push(...page.docs.map((d) => d.views));
          cursor = page.cursor;
        } while (cursor);
        expect(seen).toEqual([0, 1, 2, 3, 4]);
      });

      it("scopes reads to the requested locale", async () => {
        const post = await ctx.adapter.create("posts", {
          title: "EN",
          slug: "loc",
          locale: "en",
        });
        await ctx.adapter.create("posts", {
          title: "DE",
          slug: "loc-de",
          locale: "de",
          entity_id: post.entity_id,
        });
        const en = await ctx.adapter.find({ collection: "posts", where: { slug: "loc" }, locale: "en" });
        const de = await ctx.adapter.find({ collection: "posts", where: { slug: "loc" }, locale: "de" });
        expect(en.docs).toHaveLength(1);
        expect(de.docs).toHaveLength(0);
      });
    });

    describe("validation", () => {
      it("rejects filtering by an unknown field", async () => {
        await expect(
          ctx.adapter.find({ collection: "posts", where: { nope: 1 } }),
        ).rejects.toBeInstanceOf(EdgeCMSError);
      });
    });
  });
}
