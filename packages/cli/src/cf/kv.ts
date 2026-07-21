import type { CfClient } from "./client.js";

interface KvNamespaceInfo {
  id: string;
  title: string;
}

/** Idempotent: reuses an existing namespace with this title, or creates one. */
export async function ensureKvNamespace(client: CfClient, title: string): Promise<string> {
  const existing = await client.request<KvNamespaceInfo[]>(
    "GET",
    `/accounts/${client.accountId}/storage/kv/namespaces`,
  );
  const found = existing.find((ns) => ns.title === title);
  if (found) return found.id;

  const created = await client.request<KvNamespaceInfo>(
    "POST",
    `/accounts/${client.accountId}/storage/kv/namespaces`,
    { body: { title } },
  );
  return created.id;
}

/** Deletes a KV namespace by id. */
export async function deleteKvNamespace(client: CfClient, id: string): Promise<void> {
  await client.request("DELETE", `/accounts/${client.accountId}/storage/kv/namespaces/${id}`);
}
