import type { CfClient } from "./client.js";

export interface ZoneInfo {
  id: string;
  name: string;
}

interface ZoneApiResult {
  id: string;
  name: string;
}

/**
 * Finds the Cloudflare zone that owns `hostname`. A zone is usually the
 * apex domain, so a hostname like `mail.blog.example.com` walks candidates
 * apex-down (`mail.blog.example.com`, `blog.example.com`, `example.com`)
 * until one matches a zone on the account. Returns null if none do (the
 * domain isn't on this Cloudflare account yet).
 */
export async function findZoneForHostname(client: CfClient, hostname: string): Promise<ZoneInfo | null> {
  const labels = hostname.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    const zones = await client.request<ZoneApiResult[]>("GET", `/zones?name=${encodeURIComponent(candidate)}`);
    const found = zones.find((z) => z.name === candidate);
    if (found) return { id: found.id, name: found.name };
  }
  return null;
}

/**
 * Enables Email Routing on a zone. Idempotent — re-enabling an
 * already-enabled zone is a no-op on Cloudflare's side.
 */
export async function enableEmailRouting(client: CfClient, zoneId: string): Promise<void> {
  await client.request("POST", `/zones/${zoneId}/email/routing/enable`, { body: {} });
}

export interface EmailSendingSubdomain {
  id: string;
  name: string;
}

interface EmailSendingSubdomainApiResult {
  id: string;
  name: string;
}

/**
 * Onboards `name` (the from-address's domain) for Email Sending on the given
 * zone. Idempotent: reuses an existing subdomain entry instead of erroring.
 */
export async function enableEmailSending(
  client: CfClient,
  zoneId: string,
  name: string,
): Promise<EmailSendingSubdomain> {
  const existing = await client.request<EmailSendingSubdomainApiResult[]>(
    "GET",
    `/zones/${zoneId}/email/sending/subdomains`,
  );
  const found = existing.find((s) => s.name === name);
  if (found) return { id: found.id, name: found.name };

  const created = await client.request<EmailSendingSubdomainApiResult>(
    "POST",
    `/zones/${zoneId}/email/sending/subdomains`,
    { body: { name } },
  );
  return { id: created.id, name: created.name };
}
