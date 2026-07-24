import { spawn } from "node:child_process";
import { prepareProject } from "../project.js";
import { resolveWranglerBin } from "../wrangler-bin.js";
import { resolveAdminDist } from "../admin-assets.js";

export interface DevOptions {
  projectDir: string;
  port?: number;
  /** Interface to bind, passed to `wrangler dev --ip`. Use 0.0.0.0 for LAN access. */
  host?: string;
  /** Overrides the auto-resolved admin SPA dist (defaults to @edgecms/admin's build). */
  assetsDir?: string;
}

/**
 * `kalayaan dev`: regenerates the Worker entry + wrangler.json, then runs
 * the same Worker locally under workerd via `wrangler dev`, with local
 * D1/R2/KV simulation (Miniflare) — no Cloudflare account needed.
 */
export async function runDev(opts: DevOptions): Promise<void> {
  // Serve the built admin SPA under /admin via Workers Assets. Skipped
  // silently if the dist isn't found (API still runs).
  const assetsDir = opts.assetsDir ?? resolveAdminDist();
  const { wranglerConfigPath } = await prepareProject(opts.projectDir, assetsDir ? { assetsDir } : {});
  const wrangler = resolveWranglerBin();

  const args = ["dev", "--config", wranglerConfigPath, "--local"];
  if (opts.port) args.push("--port", String(opts.port));
  if (opts.host) args.push("--ip", opts.host);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], {
      cwd: opts.projectDir,
      stdio: "inherit",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`wrangler dev exited with code ${code}`))));
    child.on("error", reject);
  });
}
