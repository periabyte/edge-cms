import type { CfClient } from "./client.js";

interface VectorizeIndexInfo {
  name: string;
}

/**
 * Idempotent: reuses an existing Vectorize v2 index with this name, or creates
 * one sized for the embedding model (bge-m3 → 1024 dims, cosine). Returns the
 * index name that becomes the Worker's VECTORIZE binding.
 */
export async function ensureVectorizeIndex(
  client: CfClient,
  name: string,
  dimensions: number,
): Promise<{ name: string }> {
  const existing = await client.request<VectorizeIndexInfo[]>(
    "GET",
    `/accounts/${client.accountId}/vectorize/v2/indexes`,
  );
  const found = existing.find((i) => i.name === name);
  if (found) return { name: found.name };
  const created = await client.request<VectorizeIndexInfo>(
    "POST",
    `/accounts/${client.accountId}/vectorize/v2/indexes`,
    { body: { name, config: { dimensions, metric: "cosine" } } },
  );
  return { name: created.name };
}

/** Deletes a Vectorize v2 index by name. */
export async function deleteVectorizeIndex(client: CfClient, name: string): Promise<void> {
  await client.request("DELETE", `/accounts/${client.accountId}/vectorize/v2/indexes/${name}`);
}
