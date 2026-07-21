import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { CONFIG_CANDIDATES } from "../config-loader.js";
import { resolveCredentials } from "../cf/client.js";
import { runLogin } from "./login.js";
import { runDeploy } from "./deploy.js";

export type DatabaseChoice = "d1" | "postgres" | "mysql" | "mongodb";
export type Template = "blog" | "portfolio" | "docs" | "blank";

const FREE_AI_FEATURES = ["alt-text", "translate", "editorial-assist"] as const;
const ALL_AI_FEATURES = ["alt-text", "translate", "editorial-assist", "semantic-search"] as const;

export interface InitOptions {
  projectDir: string;
  name?: string;
  template?: Template;
  db?: DatabaseChoice;
  yes?: boolean;
  /** Extra content models (collections), comma-separated names. */
  collections?: string;
  /** Enable AI features (default true). `--no-ai` disables. */
  ai?: boolean;
  /** AI features to enable, comma-separated (defaults to the free set). */
  aiFeatures?: string;
  /** Enable email invites with this from-address. */
  emailFrom?: string;
  /** Custom domain to serve on. */
  domain?: string;
  /** Add a public `submissions` collection + anonymous-create grant. */
  submissions?: boolean;
  /** Deploy immediately after scaffolding (interactive asks; never on --yes). */
  deploy?: boolean;
}

const TEMPLATE_COLLECTIONS: Record<Template, string> = {
  blog: `
    collection("posts", {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
        body: field.richText(),
        cover: field.media(),
        author: field.relation("authors"),
        tags: field.relation("tags", { many: true }),
        status: field.select(["draft", "published"], { default: "draft" }),
      },
      versioning: true,
    }),
    collection("authors", {
      fields: { name: field.text({ required: true }), avatar: field.media() },
    }),
    collection("tags", {
      fields: { name: field.text({ required: true, unique: true }) },
    }),`,
  portfolio: `
    collection("projects", {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
        summary: field.text(),
        body: field.richText(),
        cover: field.media(),
        status: field.select(["draft", "published"], { default: "draft" }),
      },
    }),`,
  docs: `
    collection("pages", {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
        body: field.richText(),
        order: field.number({ integer: true, default: 0 }),
        status: field.select(["draft", "published"], { default: "draft" }),
      },
    }),`,
  blank: "",
};

/**
 * `edgecms init`: a guided setup wizard. Prompts for the content models, which
 * services to turn on, and a custom domain, then scaffolds the project and can
 * deploy it — so the whole journey is `login → init → live site`. Every prompt
 * has a flag equivalent (`--template`, `--db`, `--collections`, `--ai-features`,
 * `--email-from`, `--domain`, `--yes`), so it stays fully scriptable for CI/agents.
 */
export async function runInit(opts: InitOptions): Promise<{ configPath: string }> {
  const interactive = !opts.yes;

  const name = opts.name ?? (interactive ? String(await p.text({ message: "Project name", initialValue: "my-site" })) : "my-site");

  const template =
    opts.template ??
    (interactive
      ? ((await p.select({
          message: "Start from a template?",
          options: [
            { value: "blog", label: "Blog" },
            { value: "portfolio", label: "Portfolio" },
            { value: "docs", label: "Docs" },
            { value: "blank", label: "Blank" },
          ],
          initialValue: "blog",
        })) as Template)
      : "blog");

  const db =
    opts.db ??
    (interactive
      ? ((await p.select({
          message: "Database",
          options: [
            { value: "d1", label: "D1 (free, zero questions)" },
            { value: "postgres", label: "Postgres (via Hyperdrive)" },
            { value: "mysql", label: "MySQL (via Hyperdrive)" },
            { value: "mongodb", label: "MongoDB" },
          ],
          initialValue: "d1",
        })) as DatabaseChoice)
      : "d1");

  // Extra content models beyond the template's.
  const extraCollections = parseList(
    opts.collections ??
      (interactive
        ? String(await p.text({ message: "Add more content models? (comma-separated, blank to skip)", defaultValue: "", placeholder: "" }))
        : ""),
  )
    .map(sanitizeCollectionName)
    .filter((n): n is string => Boolean(n));

  // AI (free Workers AI features by default; semantic-search is paid).
  const aiEnabled = opts.ai ?? (interactive ? Boolean(await p.confirm({ message: "Enable AI features? (free)", initialValue: true })) : true);
  let aiFeatures: string[] = [];
  if (aiEnabled) {
    aiFeatures = opts.aiFeatures
      ? parseList(opts.aiFeatures).filter((f) => (ALL_AI_FEATURES as readonly string[]).includes(f))
      : interactive
        ? ((await p.multiselect({
            message: "Which AI features?",
            options: [
              { value: "alt-text", label: "Alt text for images" },
              { value: "translate", label: "Translation" },
              { value: "editorial-assist", label: "Editorial assist" },
              { value: "semantic-search", label: "Semantic search (paid — needs Vectorize)" },
            ],
            initialValues: [...FREE_AI_FEATURES],
            required: false,
          })) as string[])
        : [...FREE_AI_FEATURES];
  }

  // Email invites (needs a domain onboarded to Cloudflare Email Sending; the
  // copyable invite-link fallback works until then).
  const emailFrom =
    opts.emailFrom ??
    (interactive && Boolean(await p.confirm({ message: "Enable email invites?", initialValue: false }))
      ? String(await p.text({ message: "Send invites from (e.g. hello@yourdomain.com)", placeholder: "hello@yourdomain.com" }))
      : undefined);

  // Custom domain.
  const domain =
    opts.domain ??
    (interactive
      ? String(await p.text({ message: "Custom domain (blank for the free workers.dev URL)", defaultValue: "", placeholder: "blog.example.com" })).trim() || undefined
      : undefined);

  // Public submissions (anonymous create → moderated draft; needs Turnstile at deploy).
  const submissions =
    opts.submissions ??
    (interactive ? Boolean(await p.confirm({ message: "Accept public submissions? (needs Turnstile at deploy)", initialValue: false })) : false);

  for (const candidate of CONFIG_CANDIDATES) {
    if (existsSync(join(opts.projectDir, candidate)))
      throw new Error(`${candidate} already exists in ${opts.projectDir} — refusing to overwrite it.`);
  }

  const configSource = buildConfigSource({ name, db, template, extraCollections, aiEnabled, aiFeatures, emailFrom, domain, submissions });

  await mkdir(opts.projectDir, { recursive: true });
  const configPath = join(opts.projectDir, "cms.config.ts");
  await writeFile(configPath, configSource);
  await writeFile(join(opts.projectDir, "package.json"), buildPackageJson(name));
  await writeFile(
    join(opts.projectDir, ".env.example"),
    "# Run `edgecms login` to sign in — no env vars needed for local use.\n" +
      "# These are only for CI / non-interactive deploys:\n" +
      "EDGE_API_TOKEN=\nEDGE_ACCOUNT_ID=\n" +
      (db !== "d1" ? "DATABASE_URL=\n" : "") +
      (submissions ? "TURNSTILE_SECRET=\n" : ""),
  );
  await writeFile(join(opts.projectDir, ".gitignore"), "node_modules/\n.edgecms/\n.env\n.wrangler/\n");

  // Deploy at the end (never on --yes). Ties login → init → live into one flow.
  const shouldDeploy = opts.deploy ?? (interactive ? Boolean(await p.confirm({ message: "Deploy now?", initialValue: false })) : false);
  if (shouldDeploy && !opts.yes) {
    await deployNow(opts.projectDir, domain);
    return { configPath };
  }

  if (interactive) {
    p.outro(
      `Created ${configPath}\n\nNext steps:\n  cd ${opts.projectDir}\n  npm install\n  npx edgecms login   # one-time Cloudflare sign-in\n  npx edgecms deploy`,
    );
  }
  return { configPath };
}

/** login (if needed) → install deps → deploy → print the site URL. Best-effort. */
async function deployNow(projectDir: string, domain: string | undefined): Promise<void> {
  try {
    if (!(await resolveCredentials())) {
      p.log.info("You're not signed in to Cloudflare — let's do that first.");
      await runLogin({});
    }
    p.log.info("Installing dependencies…");
    spawnSync("npm", ["install"], { cwd: projectDir, stdio: "inherit" });
    const spin = p.spinner();
    spin.start("Deploying to Cloudflare");
    const result = await runDeploy({ projectDir, ...(domain && { domain }) });
    spin.stop("Deployed");
    const site = result.customDomains?.length ? `https://${result.customDomains[0]}` : result.url;
    for (const w of result.domainWarnings ?? []) p.log.warn(w);
    p.outro(`Your site: ${site}\n\nCreate your admin account: ${result.url}/admin`);
  } catch (err) {
    p.log.error(`Deploy didn't complete: ${err instanceof Error ? err.message : String(err)}`);
    p.outro(`Config is ready. Finish with:\n  cd ${projectDir}\n  npm install\n  npx edgecms login\n  npx edgecms deploy`);
  }
}

interface BuildArgs {
  name: string;
  db: DatabaseChoice;
  template: Template;
  extraCollections: string[];
  aiEnabled: boolean;
  aiFeatures: string[];
  emailFrom: string | undefined;
  domain: string | undefined;
  submissions: boolean;
}

function buildConfigSource(a: BuildArgs): string {
  const lines: string[] = [
    `import { defineConfig, collection, field } from "edgecms";`,
    ``,
    `export default defineConfig({`,
    `  name: ${JSON.stringify(a.name)},`,
    `  database: { adapter: ${JSON.stringify(a.db)} },`,
    `  storage: { adapter: "r2" },`,
    `  auth: { providers: ["email"] },`,
  ];
  if (a.domain) lines.push(`  domain: ${JSON.stringify(a.domain)},`);
  if (a.aiEnabled && a.aiFeatures.length > 0) {
    if (!a.aiFeatures.includes("semantic-search"))
      lines.push(`  // Free-tier Workers AI features (semantic-search is paid — it needs a Vectorize index).`);
    lines.push(`  ai: { enabled: true, features: ${JSON.stringify(a.aiFeatures)} },`);
  }
  if (a.emailFrom) lines.push(`  email: { from: ${JSON.stringify(a.emailFrom)} },`);
  if (a.submissions) {
    lines.push(
      `  // Anonymous visitors can submit to "submissions" (lands as a draft to moderate).`,
      `  roles: {`,
      `    public: {`,
      `      permissions: [`,
      `        { subjects: "*", actions: ["read"] },`,
      `        { subjects: ["submissions"], actions: ["create"] },`,
      `      ],`,
      `    },`,
      `  },`,
    );
  }
  lines.push(`  collections: [${buildCollections(a)}`, `  ],`, `});`, ``);
  return lines.join("\n");
}

function buildCollections(a: BuildArgs): string {
  let src = TEMPLATE_COLLECTIONS[a.template];
  for (const cname of a.extraCollections) src += extraCollectionSource(cname);
  if (a.submissions) src += submissionsCollectionSource();
  return src;
}

function extraCollectionSource(name: string): string {
  return `
    collection(${JSON.stringify(name)}, {
      fields: {
        title: field.text({ required: true }),
        slug: field.slug({ from: "title", unique: true }),
        body: field.richText(),
        status: field.select(["draft", "published"], { default: "draft" }),
      },
    }),`;
}

function submissionsCollectionSource(): string {
  return `
    collection("submissions", {
      fields: {
        name: field.text({ required: true }),
        email: field.text(),
        message: field.richText(),
      },
    }),`;
}

function buildPackageJson(name: string): string {
  return (
    JSON.stringify(
      {
        name: sanitizeCollectionName(name) ?? "edgecms-site",
        private: true,
        type: "module",
        scripts: { dev: "edgecms dev", deploy: "edgecms deploy" },
        dependencies: { edgecms: "latest" },
      },
      null,
      2,
    ) + "\n"
  );
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Coerce a user-supplied name to a valid snake_case collection name, or null if empty. */
function sanitizeCollectionName(raw: string): string | null {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) return null;
  return /^[a-z]/.test(s) ? s : `c_${s}`;
}
