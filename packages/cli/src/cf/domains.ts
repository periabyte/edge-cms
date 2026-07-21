import type { CfClient } from "./client.js";

export interface WorkerDomain {
  id: string;
  hostname: string;
}

interface DomainInfo {
  id: string;
  hostname: string;
  service: string;
  zone_id?: string;
  zone_name?: string;
}

/**
 * Attach a Workers Custom Domain to a service. Idempotent: reuses an existing
 * attachment for the hostname. `zone_id`/`zone_name` are omitted — Cloudflare
 * matches the hostname to a zone in the account, and auto-creates the proxied
 * DNS record + TLS cert. The hostname's zone must already be on the account or
 * the PUT fails (the caller surfaces that as guidance).
 */
export async function attachWorkerCustomDomain(
  client: CfClient,
  opts: { hostname: string; service: string },
): Promise<WorkerDomain> {
  const existing = await client.request<DomainInfo[]>(
    "GET",
    `/accounts/${client.accountId}/workers/domains?hostname=${encodeURIComponent(opts.hostname)}`,
  );
  const found = existing.find((d) => d.hostname === opts.hostname);
  if (found) return { id: found.id, hostname: found.hostname };

  const created = await client.request<DomainInfo>("PUT", `/accounts/${client.accountId}/workers/domains`, {
    body: { hostname: opts.hostname, service: opts.service, environment: "production" },
  });
  return { id: created.id, hostname: created.hostname };
}

/** Detach a custom domain by its attachment id (removes the DNS record). */
export async function deleteWorkerCustomDomain(client: CfClient, id: string): Promise<void> {
  await client.request("DELETE", `/accounts/${client.accountId}/workers/domains/${id}`);
}
