import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Resolves the wrangler CLI entry script via Node module resolution from
 * this package, rather than relying on PATH — works whether `edgecms` was
 * installed globally, as a project dependency, or run through a monorepo
 * workspace.
 */
export function resolveWranglerBin(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("wrangler/package.json");
  const pkg = require(pkgPath) as { bin?: string | Record<string, string> };
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.wrangler;
  if (!bin) throw new Error("Could not resolve the wrangler CLI entry point");
  return join(dirname(pkgPath), bin);
}
