import type { CfClient } from "./client.js";

interface HyperdriveConfigInfo {
  id: string;
  name: string;
}

export interface HyperdriveOrigin {
  scheme: "postgres" | "mysql";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Parse a `postgres://user:pass@host:port/db` (or `mysql://…`) connection
 * string into the origin shape Hyperdrive's API expects. Defaults the port to
 * 5432/3306 by scheme.
 */
export function parseDatabaseUrl(url: string): HyperdriveOrigin {
  const u = new URL(url);
  const scheme = u.protocol.replace(/:$/, "");
  if (scheme !== "postgres" && scheme !== "postgresql" && scheme !== "mysql")
    throw new Error(`Unsupported database URL scheme "${scheme}" (expected postgres:// or mysql://)`);
  const normalized: "postgres" | "mysql" = scheme === "mysql" ? "mysql" : "postgres";
  const port = u.port ? Number(u.port) : normalized === "mysql" ? 3306 : 5432;
  const database = u.pathname.replace(/^\//, "");
  if (!database) throw new Error("Database URL is missing a database name");
  if (!u.username) throw new Error("Database URL is missing a username");
  return {
    scheme: normalized,
    host: u.hostname,
    port,
    database,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

/**
 * Idempotent: reuses an existing Hyperdrive config with this name, or creates
 * one pointing at the given external database origin. Returns the config id
 * that becomes the Worker's HYPERDRIVE binding.
 */
export async function ensureHyperdrive(
  client: CfClient,
  name: string,
  origin: HyperdriveOrigin,
): Promise<{ id: string }> {
  const existing = await client.request<HyperdriveConfigInfo[]>(
    "GET",
    `/accounts/${client.accountId}/hyperdrive/configs`,
  );
  const found = existing.find((c) => c.name === name);
  const body = {
    name,
    origin: {
      scheme: origin.scheme,
      host: origin.host,
      port: origin.port,
      database: origin.database,
      user: origin.user,
      password: origin.password,
    },
  };
  if (found) {
    await client.request<HyperdriveConfigInfo>(
      "PATCH",
      `/accounts/${client.accountId}/hyperdrive/configs/${found.id}`,
      { body },
    );
    return { id: found.id };
  }
  const created = await client.request<HyperdriveConfigInfo>(
    "POST",
    `/accounts/${client.accountId}/hyperdrive/configs`,
    { body },
  );
  return { id: created.id };
}

/** Deletes a Hyperdrive config by id. */
export async function deleteHyperdrive(client: CfClient, id: string): Promise<void> {
  await client.request("DELETE", `/accounts/${client.accountId}/hyperdrive/configs/${id}`);
}
