import type { CfClient } from "./client.js";

interface R2BucketInfo {
  name: string;
}

/** Idempotent: reuses an existing bucket with this name, or creates one. */
export async function ensureR2Bucket(client: CfClient, name: string): Promise<{ name: string }> {
  const existing = await client
    .request<{ buckets: R2BucketInfo[] }>("GET", `/accounts/${client.accountId}/r2/buckets`)
    .catch(() => ({ buckets: [] }));
  if (existing.buckets.some((b) => b.name === name)) return { name };

  await client.request("POST", `/accounts/${client.accountId}/r2/buckets`, { body: { name } });
  return { name };
}

/** Deletes an R2 bucket. Fails if the bucket still contains objects. */
export async function deleteR2Bucket(client: CfClient, name: string): Promise<void> {
  await client.request("DELETE", `/accounts/${client.accountId}/r2/buckets/${name}`);
}

/**
 * CORS so the admin UI (served from the Worker's own origin) can PUT
 * uploads directly. Wide open by design for Phase 1's Worker-proxied
 * upload path — see @edgecms/runtime's media routes, which authenticate
 * every upload — and gets scoped to presigned-URL origins in Phase 2.
 */
export async function ensureR2Cors(client: CfClient, bucketName: string): Promise<void> {
  await client.request("PUT", `/accounts/${client.accountId}/r2/buckets/${bucketName}/cors`, {
    body: {
      rules: [
        {
          allowed: { methods: ["GET", "PUT"], origins: ["*"] },
          maxAgeSeconds: 3600,
        },
      ],
    },
  });
}
