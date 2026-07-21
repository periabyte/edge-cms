import { describe, expect, it, vi } from "vitest";
import { PluginHost, type HookContext, type Plugin } from "../src/plugin.js";

const ctx = (over: Partial<HookContext> = {}): HookContext => ({
  collection: "posts",
  operation: "create",
  data: {},
  actor: null,
  ...over,
});

describe("PluginHost", () => {
  it("threads beforeChange data through plugins in order", async () => {
    const a: Plugin = { name: "a", hooks: { beforeChange: (c) => ({ ...c.data, seen: ["a"] }) } };
    const b: Plugin = {
      name: "b",
      hooks: { beforeChange: (c) => ({ ...c.data, seen: [...(c.data.seen as string[]), "b"] }) },
    };
    const out = await new PluginHost([a, b]).beforeChange(ctx({ data: {} }));
    expect(out.seen).toEqual(["a", "b"]);
  });

  it("awaits async beforeChange transforms", async () => {
    const p: Plugin = {
      name: "slugify",
      hooks: { beforeChange: async (c) => ({ ...c.data, slug: String(c.data.title).toLowerCase() }) },
    };
    const out = await new PluginHost([p]).beforeChange(ctx({ data: { title: "HELLO" } }));
    expect(out.slug).toBe("hello");
  });

  it("runs afterChange for every plugin and afterPublish only when asked", async () => {
    const afterChange = vi.fn();
    const afterPublish = vi.fn();
    const host = new PluginHost([{ name: "p", hooks: { afterChange, afterPublish } }]);
    await host.afterChange(ctx());
    expect(afterChange).toHaveBeenCalledOnce();
    expect(afterPublish).not.toHaveBeenCalled();
    await host.afterPublish(ctx());
    expect(afterPublish).toHaveBeenCalledOnce();
  });

  it("merges custom field-type validators across plugins", () => {
    const host = new PluginHost([
      { name: "geo", fieldTypes: { latlng: (v) => v } },
      { name: "color", fieldTypes: { hex: (v) => String(v).toUpperCase() } },
    ]);
    const types = host.fieldTypes();
    expect(Object.keys(types).sort()).toEqual(["hex", "latlng"]);
    expect(types.hex!("#abc")).toBe("#ABC");
  });

  it("is a no-op with no plugins", async () => {
    const host = new PluginHost();
    expect(await host.beforeChange(ctx({ data: { a: 1 } }))).toEqual({ a: 1 });
    await expect(host.afterDelete(ctx({ operation: "delete" }))).resolves.toBeUndefined();
  });
});
