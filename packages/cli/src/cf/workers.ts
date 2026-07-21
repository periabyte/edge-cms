import type { CfClient } from "./client.js";

export interface WorkerBinding {
  type:
    | "d1"
    | "r2_bucket"
    | "kv_namespace"
    | "plain_text"
    | "secret_text"
    | "assets"
    | "ai"
    | "hyperdrive"
    | "vectorize"
    | "send_email";
  name: string;
  [key: string]: unknown;
}

export interface UploadWorkerOptions {
  name: string;
  /** Bundled Worker source (single ESM module — see worker-bundle.ts). */
  code: string;
  mainModuleFilename: string;
  compatibilityDate: string;
  bindings: WorkerBinding[];
  /** Completion JWT from uploadAssets(), if the config has a built admin SPA. */
  assetsJwt?: string;
  /**
   * Static-assets routing config, applied alongside assetsJwt. Without it the
   * deployed Worker won't serve the SPA (e.g. GET /admin has no static file, so
   * it falls through to the Worker and 404s) — it mirrors what `dev`'s
   * generated wrangler.json sets.
   */
  assetsConfig?: { not_found_handling: string; run_worker_first: string[] };
}

/** Deploys a Worker via the Module Upload API (multipart: metadata + module). */
export async function uploadWorkerScript(client: CfClient, opts: UploadWorkerOptions): Promise<void> {
  const bindings = [...opts.bindings];
  if (opts.assetsJwt) bindings.push({ type: "assets", name: "ASSETS" });

  const metadata = {
    main_module: opts.mainModuleFilename,
    compatibility_date: opts.compatibilityDate,
    bindings,
    // The Module Upload API replaces a Worker's bindings on every PUT. Secrets
    // (set separately via the secrets API) are NOT in `bindings`, so without
    // this flag every redeploy would wipe SESSION_SECRET — breaking auth until
    // the next first-deploy-only secret set (which never re-runs). keep_secrets
    // tells Cloudflare to retain previously-set secrets.
    keep_secrets: true,
    // Enable Workers Logs by default (and keep it on across redeploys — the
    // upload otherwise resets observability to the account default).
    observability: { enabled: true, head_sampling_rate: 1 },
    ...(opts.assetsJwt && {
      assets: {
        jwt: opts.assetsJwt,
        ...(opts.assetsConfig && { config: opts.assetsConfig }),
      },
    }),
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append(
    opts.mainModuleFilename,
    new Blob([opts.code], { type: "application/javascript+module" }),
    opts.mainModuleFilename,
  );

  await client.request(
    "PUT",
    `/accounts/${client.accountId}/workers/scripts/${opts.name}`,
    { formData: form },
  );
}

export async function setWorkerSecret(
  client: CfClient,
  workerName: string,
  secretName: string,
  value: string,
): Promise<void> {
  await client.request("PUT", `/accounts/${client.accountId}/workers/scripts/${workerName}/secrets`, {
    body: { name: secretName, text: value, type: "secret_text" },
  });
}

/** Deletes a Worker script (force removes it even with active bindings). */
export async function deleteWorkerScript(client: CfClient, name: string): Promise<void> {
  await client.request("DELETE", `/accounts/${client.accountId}/workers/scripts/${name}?force=true`);
}

export async function enableWorkersDevSubdomain(client: CfClient, workerName: string): Promise<{ url: string }> {
  await client.request(
    "POST",
    `/accounts/${client.accountId}/workers/scripts/${workerName}/subdomain`,
    { body: { enabled: true } },
  );
  const subdomain = await client
    .request<{ subdomain: string }>("GET", `/accounts/${client.accountId}/workers/subdomain`)
    .catch(() => null);
  return { url: subdomain ? `https://${workerName}.${subdomain.subdomain}.workers.dev` : `` };
}
