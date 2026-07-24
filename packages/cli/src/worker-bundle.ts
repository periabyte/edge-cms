import * as esbuild from "esbuild";

/**
 * Bundles the generated Worker entry into one self-contained ESM module for
 * direct upload via the Workers API (unlike `kalayaan dev`, which hands the
 * unbundled entry to `wrangler dev` and lets wrangler's own bundler do
 * this). Everything — @edgecms/config, @edgecms/runtime, adapter-d1,
 * storage-r2, hono, zod — gets inlined; nothing is external except the
 * `cloudflare:*` built-ins the runtime provides and the optional external-DB
 * drivers.
 *
 * `postgres` / `mysql2` and Node built-ins are marked external: the runtime
 * only `import()`s a driver when the configured database is Postgres/MySQL
 * (never on the D1 default), and those deploys run the Worker with
 * `nodejs_compat`, where the driver and `node:*` shims resolve at runtime.
 * Keeping them external means a D1 bundle stays small and doesn't need the
 * drivers installed at all.
 */
export async function buildWorkerBundle(entryPath: string): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["workerd", "worker", "browser"],
    external: ["cloudflare:*", "postgres", "mysql2", "mysql2/promise", "node:*"],
    write: false,
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error("Worker bundle produced no output");
  return output.text;
}
