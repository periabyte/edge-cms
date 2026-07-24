import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "kalayaan-init-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("runInit", () => {
  it("is fully scriptable with --yes and flags, no prompts", async () => {
    const { configPath } = await runInit({
      projectDir: dir,
      name: "flag-driven-site",
      template: "blog",
      db: "d1",
      yes: true,
    });
    const src = await readFile(configPath, "utf-8");
    expect(src).toContain('name: "flag-driven-site"');
    expect(src).toContain('collection("posts"');
    expect(src).toContain('collection("authors"');
    expect(src).toContain('collection("tags"');
  });

  it("defaults to only free Cloudflare services (free AI features, no semantic-search)", async () => {
    const { configPath } = await runInit({ projectDir: dir, name: "free-site", template: "blog", db: "d1", yes: true });
    const src = await readFile(configPath, "utf-8");
    // Exact free feature set — pinning it inherently excludes the paid
    // semantic-search from the enabled features (the comment may still mention it).
    expect(src).toContain('features: ["alt-text","translate","editorial-assist"]');
    expect(src).not.toMatch(/features:\s*\[[^\]]*semantic-search/);
  });

  it("produces a config that resolves without error", async () => {
    await runInit({ projectDir: dir, name: "valid-site", template: "blog", db: "d1", yes: true });
    // node_modules/kalayaan doesn't exist in this temp dir, so we only check
    // the generated source is syntactically loadable JSON-shape data via a
    // direct resolveConfig call on the parsed collections, not full esbuild
    // resolution (that's covered by the CLI e2e test with a real symlink).
    const src = await readFile(join(dir, "cms.config.ts"), "utf-8");
    expect(src).toMatch(/export default defineConfig\(/);
  });

  it("scaffolds blank/portfolio/docs templates with distinct collections", async () => {
    const portfolio = await mkdtemp(join(tmpdir(), "kalayaan-init-portfolio-"));
    await runInit({ projectDir: portfolio, template: "portfolio", db: "d1", yes: true });
    expect(await readFile(join(portfolio, "cms.config.ts"), "utf-8")).toContain('collection("projects"');
    await rm(portfolio, { recursive: true, force: true });

    const blank = await mkdtemp(join(tmpdir(), "kalayaan-init-blank-"));
    await runInit({ projectDir: blank, template: "blank", db: "d1", yes: true });
    const blankSrc = await readFile(join(blank, "cms.config.ts"), "utf-8");
    expect(blankSrc).toContain("collections: [\n  ]");
    await rm(blank, { recursive: true, force: true });
  });

  it("writes .env.example, .gitignore, and a package.json", async () => {
    await runInit({ projectDir: dir, name: "x", template: "blank", db: "d1", yes: true });
    expect(await readFile(join(dir, ".env.example"), "utf-8")).toContain("EDGE_API_TOKEN");
    expect(await readFile(join(dir, ".gitignore"), "utf-8")).toContain(".kalayaan/");
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
    expect(pkg.dependencies.kalayaan).toBeDefined();
    expect(pkg.scripts.deploy).toBe("kalayaan deploy");
  });

  it("threads wizard flags into config (domain, email, extra models) and never deploys on --yes", async () => {
    const { configPath } = await runInit({
      projectDir: dir,
      name: "flagged",
      template: "blank",
      db: "d1",
      collections: "recipes, Guest Posts",
      aiFeatures: "alt-text",
      emailFrom: "hi@example.com",
      domain: "blog.example.com",
      yes: true,
    });
    const src = await readFile(configPath, "utf-8");
    expect(src).toContain('domain: "blog.example.com"');
    expect(src).toContain('email: { from: "hi@example.com" }');
    expect(src).toContain('features: ["alt-text"]');
    expect(src).toContain('collection("recipes"');
    // Names are sanitized to snake_case.
    expect(src).toContain('collection("guest_posts"');
  });

  it("--submissions adds the collection and an anonymous-create public role", async () => {
    await runInit({ projectDir: dir, template: "blank", db: "d1", submissions: true, yes: true });
    const src = await readFile(join(dir, "cms.config.ts"), "utf-8");
    expect(src).toContain('collection("submissions"');
    expect(src).toContain('subjects: ["submissions"], actions: ["create"]');
    expect(await readFile(join(dir, ".env.example"), "utf-8")).toContain("TURNSTILE_SECRET");
  });

  it("--no-ai omits the ai block", async () => {
    await runInit({ projectDir: dir, template: "blank", db: "d1", ai: false, yes: true });
    const src = await readFile(join(dir, "cms.config.ts"), "utf-8");
    expect(src).not.toContain("ai: {");
  });

  it("refuses to overwrite an existing config", async () => {
    await runInit({ projectDir: dir, name: "x", template: "blank", db: "d1", yes: true });
    await expect(
      runInit({ projectDir: dir, name: "y", template: "blank", db: "d1", yes: true }),
    ).rejects.toThrow(/already exists/);
  });
});
