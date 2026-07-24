import { CfClient, resolveCredentials, type CfCredentials } from "../cf/client.js";
import { deleteWorkerScript } from "../cf/workers.js";
import { deleteWorkerCustomDomain } from "../cf/domains.js";
import { deleteD1Database } from "../cf/d1.js";
import { deleteKvNamespace } from "../cf/kv.js";
import { deleteR2Bucket } from "../cf/r2.js";
import { deleteVectorizeIndex } from "../cf/vectorize.js";
import { deleteHyperdrive } from "../cf/hyperdrive.js";
import { emptyState, readState, writeState } from "../state.js";

export interface DownOptions {
  projectDir: string;
  /** Injectable for tests; defaults to a real client built from env credentials. */
  client?: CfClient;
  /** List what would be deleted without touching Cloudflare or state. */
  dryRun?: boolean;
}

export interface DownResult {
  /** Human-readable labels of every resource this teardown targets. */
  resources: string[];
  deleted: string[];
  failed: string[];
}

interface Target {
  label: string;
  delete: (client: CfClient) => Promise<void>;
}

/**
 * `kalayaan down`: deletes every Cloudflare resource recorded in
 * `.kalayaan/state.json` — the Worker, D1 database, KV namespaces, R2 bucket,
 * and (when present) Vectorize/Hyperdrive — then resets local state so a later
 * `deploy` provisions cleanly. Destructive and irreversible; the CLI confirms
 * before calling this without `dryRun`. The Worker is removed first so nothing
 * still references the bindings being torn down.
 */
export async function runDown(opts: DownOptions): Promise<DownResult> {
  const state = await readState(opts.projectDir);
  const r = state.resources;
  const targets: Target[] = [];

  // Detach custom domains before the Worker is deleted (they reference it).
  for (const d of r.domains ?? [])
    targets.push({ label: `Custom domain: ${d.hostname}`, delete: (c) => deleteWorkerCustomDomain(c, d.id) });
  if (r.worker) targets.push({ label: `Worker: ${r.worker.name}`, delete: (c) => deleteWorkerScript(c, r.worker!.name) });
  if (r.d1) targets.push({ label: `D1 database: ${r.d1.name}`, delete: (c) => deleteD1Database(c, r.d1!.id) });
  if (r.kv?.cache) targets.push({ label: `KV namespace: cache`, delete: (c) => deleteKvNamespace(c, r.kv!.cache) });
  if (r.kv?.sessions) targets.push({ label: `KV namespace: sessions`, delete: (c) => deleteKvNamespace(c, r.kv!.sessions) });
  if (r.r2) targets.push({ label: `R2 bucket: ${r.r2.name}`, delete: (c) => deleteR2Bucket(c, r.r2!.name) });
  if (r.vectorize) targets.push({ label: `Vectorize index: ${r.vectorize.name}`, delete: (c) => deleteVectorizeIndex(c, r.vectorize!.name) });
  if (r.hyperdrive) targets.push({ label: `Hyperdrive config: ${r.hyperdrive.id}`, delete: (c) => deleteHyperdrive(c, r.hyperdrive!.id) });

  const resources = targets.map((t) => t.label);
  if (opts.dryRun) return { resources, deleted: [], failed: [] };
  if (targets.length === 0) return { resources, deleted: [], failed: [] };

  const client = opts.client ?? new CfClient(await requireCredentials());
  const deleted: string[] = [];
  const failed: string[] = [];

  for (const t of targets) {
    try {
      await t.delete(client);
      deleted.push(t.label);
    } catch (err) {
      failed.push(`${t.label} — ${err instanceof Error ? err.message : "delete failed"}`);
    }
  }

  // Reset local state: even a partial teardown must not leave a stale schema
  // snapshot, or the next deploy would think migrations are already applied
  // against the (now-deleted) database.
  await writeState(opts.projectDir, emptyState());

  return { resources, deleted, failed };
}

async function requireCredentials(): Promise<CfCredentials> {
  const creds = await resolveCredentials();
  if (!creds)
    throw new Error(
      "Not signed in to Cloudflare. Run `kalayaan login`, or set EDGE_API_TOKEN + EDGE_ACCOUNT_ID (CI).",
    );
  return creds;
}
