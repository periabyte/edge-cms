import { findConfigFile, loadConfig } from "../config-loader.js";
import { resolveCredentials, CfClient } from "../cf/client.js";
import { resolveWranglerBin } from "../wrangler-bin.js";
import { lastSnapshot, readState } from "../state.js";
import { planMigration } from "../migration.js";
import { isApexDomain } from "../domain-utils.js";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

/**
 * `kalayaan doctor`: validates config, token scopes, and migration state so
 * a broken setup fails with a clear message instead of a confusing error
 * three commands later.
 */
export async function runDoctor(projectDir: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  const configPath = findConfigFile(projectDir);
  if (!configPath) {
    checks.push({ name: "config", status: "fail", message: "No cms.config file found. Run `kalayaan init`." });
    return checks;
  }

  let resolved;
  try {
    const loaded = await loadConfig(projectDir);
    resolved = loaded.resolved;
    checks.push({ name: "config", status: "ok", message: `Loaded and validated ${configPath}` });
    // Free-tier guard: semantic search is the only feature that needs the paid
    // Workers plan (Vectorize has no free tier). Everything else stays free.
    if (resolved.ai.enabled && resolved.ai.features.includes("semantic-search")) {
      checks.push({
        name: "free-tier",
        status: "warn",
        message: "semantic-search needs the paid Workers plan (Vectorize). Remove it from ai.features to stay free.",
      });
    } else {
      checks.push({ name: "free-tier", status: "ok", message: "Only free Cloudflare services are enabled" });
    }

    const apexDomains = resolved.domain.filter(isApexDomain);
    if (apexDomains.length > 0) {
      checks.push({
        name: "domain",
        status: "warn",
        message:
          `${apexDomains.join(", ")} looks like a root domain. Kalayaan is headless (no homepage) — ` +
          `consider a subdomain (e.g. cms.${apexDomains[0]}) instead, so the root domain stays free ` +
          "for your own site. See docs/custom-root-page.md.",
      });
    }
  } catch (err) {
    checks.push({
      name: "config",
      status: "fail",
      message: err instanceof Error ? err.message : "Config failed to load",
    });
    return checks;
  }

  try {
    resolveWranglerBin();
    checks.push({ name: "wrangler", status: "ok", message: "wrangler is resolvable" });
  } catch {
    checks.push({ name: "wrangler", status: "fail", message: "Could not resolve the wrangler CLI" });
  }

  const creds = await resolveCredentials();
  if (!creds) {
    checks.push({
      name: "cloudflare-credentials",
      status: "warn",
      message:
        "Not signed in to Cloudflare — run `kalayaan login` (or set EDGE_API_TOKEN / EDGE_ACCOUNT_ID for CI). `dev` and `migrate` still work locally.",
    });
  } else {
    try {
      const client = new CfClient(creds);
      await client.request("GET", `/accounts/${client.accountId}`);
      checks.push({ name: "cloudflare-credentials", status: "ok", message: "Token can reach the account" });
    } catch (err) {
      checks.push({
        name: "cloudflare-credentials",
        status: "fail",
        message: err instanceof Error ? err.message : "Token validation failed",
      });
    }
  }

  const state = await readState(projectDir);
  const plan = planMigration(resolved, lastSnapshot(state));
  if (plan.statements.length === 0) {
    checks.push({ name: "migrations", status: "ok", message: "Schema is up to date" });
  } else {
    checks.push({
      name: "migrations",
      status: "warn",
      message: `${plan.statements.length} pending statement(s)${plan.destructive ? " (includes destructive changes)" : ""} — run \`kalayaan migrate\``,
    });
  }

  return checks;
}
