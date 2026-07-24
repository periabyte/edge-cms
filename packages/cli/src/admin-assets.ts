import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Locates the built admin SPA (`@kalayaan/admin`'s `dist/`) so `dev` and
 * `deploy` can serve it as Workers Assets without the caller wiring a path.
 * Returns undefined when the package or its build output can't be found — in
 * which case assets are simply skipped (the API still runs; the SPA 404s),
 * matching the pre-wiring behavior.
 *
 * Resolution is relative to this CLI module, which declares `@kalayaan/admin`
 * as a dependency, so it works both in the workspace and in an installed tree.
 */
export function resolveAdminDist(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve("@kalayaan/admin/package.json");
    const dist = join(dirname(pkgJson), "dist");
    if (existsSync(join(dist, "index.html"))) return dist;
  } catch {
    // fall through
  }
  return undefined;
}
