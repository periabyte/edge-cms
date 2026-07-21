import { describe, expect, it } from "vitest";
import { collection, ConfigError, defineConfig, field, resolveConfig } from "../src/index.js";
import { blogConfig } from "./fixtures.js";

describe("resolveConfig", () => {
  it("resolves the blog example config with defaults filled", () => {
    const resolved = resolveConfig(blogConfig());
    expect(resolved.database.adapter).toBe("d1");
    expect(resolved.storage.adapter).toBe("r2");
    expect(resolved.collections).toHaveLength(3);

    const posts = resolved.collections.find((c) => c.name === "posts")!;
    expect(posts.versioning).toBe(true);
    expect(posts.locales).toEqual(["en", "de"]);
    expect(posts.defaultLocale).toBe("en");
    expect(posts.titleField).toBe("title");
    expect(posts.hooks.afterPublish).toEqual(["revalidate-frontend"]);

    const authors = resolved.collections.find((c) => c.name === "authors")!;
    expect(authors.versioning).toBe(false);
    expect(authors.locales).toEqual([]);
    expect(authors.defaultLocale).toBeNull();
    expect(authors.titleField).toBe("name");
  });

  it("defaults database to d1 and auth to email when omitted", () => {
    const resolved = resolveConfig(
      defineConfig({ name: "bare", collections: [collection("things", { fields: {} })] }),
    );
    expect(resolved.database.adapter).toBe("d1");
    expect(resolved.auth.providers).toEqual(["email"]);
    expect(resolved.ai.enabled).toBe(false);
  });

  it("defaults email to disabled (cloudflare provider, null from) when omitted", () => {
    const resolved = resolveConfig(
      defineConfig({ name: "bare", collections: [collection("things", { fields: {} })] }),
    );
    expect(resolved.email).toEqual({
      provider: "cloudflare",
      from: null,
      fromName: null,
      replyTo: null,
      baseUrl: null,
    });
  });

  it("resolves a configured email block", () => {
    const resolved = resolveConfig(
      defineConfig({
        name: "mail",
        email: { from: "hello@acme.dev", fromName: "Acme" },
        collections: [collection("things", { fields: {} })],
      }),
    );
    expect(resolved.email.from).toBe("hello@acme.dev");
    expect(resolved.email.fromName).toBe("Acme");
    expect(resolved.email.provider).toBe("cloudflare");
  });

  it("normalizes domain (string or array) to a string[] and defaults to []", () => {
    const none = resolveConfig(defineConfig({ name: "n", collections: [collection("things", { fields: {} })] }));
    expect(none.domain).toEqual([]);

    const one = resolveConfig(
      defineConfig({ name: "n", domain: "blog.example.com", collections: [collection("things", { fields: {} })] }),
    );
    expect(one.domain).toEqual(["blog.example.com"]);

    const many = resolveConfig(
      defineConfig({
        name: "n",
        domain: ["example.com", "www.example.com"],
        collections: [collection("things", { fields: {} })],
      }),
    );
    expect(many.domain).toEqual(["example.com", "www.example.com"]);
  });

  it("rejects a malformed domain", () => {
    expect(() =>
      resolveConfig(
        defineConfig({ name: "n", domain: "not a domain", collections: [collection("things", { fields: {} })] }),
      ),
    ).toThrowError(ConfigError);
  });

  it("always guarantees the reserved admin and public roles", () => {
    const resolved = resolveConfig(
      defineConfig({ name: "bare", collections: [collection("things", { fields: {} })] }),
    );
    expect(resolved.roles.admin?.admin).toBe(true);
    expect(resolved.roles.public).toBeDefined();
    // Default public role can read all collections.
    expect(resolved.roles.public?.permissions).toContainEqual({ subjects: "*", actions: ["read"] });

    // A project that declares its own roles still gets admin + public back-filled.
    const custom = resolveConfig(
      defineConfig({
        name: "custom",
        roles: { editor: { permissions: [{ subjects: "*", actions: ["read", "create"] }] } },
        collections: [collection("things", { fields: {} })],
      }),
    );
    expect(custom.roles.admin?.admin).toBe(true);
    expect(custom.roles.public).toBeDefined();
  });

  const bad = (mutate: (c: ReturnType<typeof blogConfig>) => void, match: string | RegExp) => {
    const config = blogConfig();
    mutate(config);
    expect(() => resolveConfig(config)).toThrowError(ConfigError);
    try {
      resolveConfig(config);
    } catch (e) {
      expect((e as ConfigError).issues.join("\n")).toMatch(match);
    }
  };

  it("rejects relation to unknown collection", () => {
    bad((c) => {
      (c.collections[0]!.fields as Record<string, unknown>).author = field.relation("nope");
    }, /relation target "nope"/);
  });

  it("rejects slug whose source field is missing", () => {
    bad((c) => {
      (c.collections[0]!.fields as Record<string, unknown>).slug = field.slug({ from: "ghost" });
    }, /slug source "ghost"/);
  });

  it("rejects slug whose source is not a text field", () => {
    bad((c) => {
      (c.collections[0]!.fields as Record<string, unknown>).slug = field.slug({ from: "body" });
    }, /must be a text field/);
  });

  it("rejects select default outside options", () => {
    bad((c) => {
      (c.collections[0]!.fields as Record<string, unknown>).status = field.select(
        ["draft", "published"],
        { default: "archived" },
      );
    }, /default "archived"/);
  });

  it("rejects reserved field names", () => {
    bad((c) => {
      (c.collections[0]!.fields as Record<string, unknown>).id = field.text();
    }, /reserved/);
  });

  it("rejects reserved collection names", () => {
    bad((c) => {
      (c.collections as unknown[]).push(collection("users", { fields: {} }));
    }, /reserved for system tables/);
  });

  it("rejects duplicate collections", () => {
    bad((c) => {
      (c.collections as unknown[]).push(collection("posts", { fields: {} }));
    }, /duplicate collection "posts"/);
  });

  it("rejects bad locale codes", () => {
    bad((c) => {
      (c.collections[0] as { localization: string[] }).localization = ["english"];
    }, /locales look like/);
  });

  it("rejects non-snake_case collection names", () => {
    const config = defineConfig({
      name: "x",
      collections: [collection("BlogPosts", { fields: {} })],
    });
    expect(() => resolveConfig(config)).toThrowError(/snake_case/);
  });

  it("resolves a custom (plugin) field with its type name and control hint", () => {
    const config = defineConfig({
      name: "x",
      collections: [
        collection("things", {
          fields: { color: field.custom("hex", { control: "text", label: "Color" }) },
        }),
      ],
    });
    const resolved = resolveConfig(config);
    const def = resolved.collections[0]!.fields[0]!.def as {
      type: string;
      fieldType: string;
      control: string;
    };
    expect(def.type).toBe("custom");
    expect(def.fieldType).toBe("hex");
    expect(def.control).toBe("text");
  });

  it("rejects a custom field with an unknown control hint", () => {
    const config = defineConfig({
      name: "x",
      collections: [
        collection("things", {
          fields: { color: field.custom("hex", { control: "colorpicker" as never }) },
        }),
      ],
    });
    expect(() => resolveConfig(config)).toThrowError(ConfigError);
  });

  it("rejects unknown keys (strict schemas)", () => {
    const config = blogConfig() as unknown as Record<string, unknown>;
    config.databse = { adapter: "d1" };
    expect(() => resolveConfig(config as never)).toThrowError(ConfigError);
  });
});
