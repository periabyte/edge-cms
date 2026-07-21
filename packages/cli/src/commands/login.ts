import { spawn } from "node:child_process";
import * as p from "@clack/prompts";
import { CfClient, type CfCredentials } from "../cf/client.js";
import { listAccounts, type CfAccount } from "../cf/accounts.js";
import { writeStoredCredentials } from "../credentials-store.js";

/**
 * The Cloudflare API-token permission groups EdgeCMS needs. The first five cover
 * the entire free stack (Workers + KV + R2 + D1 + account read for discovery);
 * `vectorize` is included so opting into (paid) semantic search later doesn't
 * require re-minting. The grant itself is free — only *using* Vectorize costs.
 */
const PERMISSION_GROUPS = [
  { key: "workers_scripts", type: "edit" },
  { key: "workers_kv_storage", type: "edit" },
  { key: "workers_r2", type: "edit" },
  { key: "d1", type: "edit" },
  { key: "account_settings", type: "read" },
  { key: "vectorize", type: "edit" },
  // Zone-level: attaching a custom domain creates a proxied DNS record + route.
  { key: "dns", type: "edit" },
  { key: "workers_routes", type: "edit" },
];

/** Human-readable checklist printed as the reliable fallback if the pre-fill doesn't apply. */
const PERMISSION_CHECKLIST = [
  "Account · Workers Scripts · Edit",
  "Account · Workers KV Storage · Edit",
  "Account · Workers R2 Storage · Edit",
  "Account · D1 · Edit",
  "Account · Account Settings · Read",
  "Account · Vectorize · Edit (only if you use semantic search)",
  "Zone · DNS · Edit (for custom domains)",
  "Zone · Workers Routes · Edit (for custom domains)",
];

export function tokenTemplateUrl(): string {
  const keys = encodeURIComponent(JSON.stringify(PERMISSION_GROUPS));
  // zoneId=all so the zone-level DNS/Routes groups apply to the user's zones.
  return `https://dash.cloudflare.com/?to=/:account/api-tokens&name=EdgeCMS&zoneId=all&permissionGroupKeys=${keys}`;
}

export interface LoginOptions {
  /** Non-interactive: use this token instead of prompting. */
  token?: string;
  /** Pick this account id when the token can reach more than one. */
  account?: string;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  home?: string;
  /** Force non-interactive (defaults to !stdin.isTTY). */
  nonInteractive?: boolean;
}

export interface LoginResult {
  accountId: string;
  accountName: string;
}

/**
 * Guided sign-in: opens a pre-filled Cloudflare token page, takes the pasted
 * token, discovers the account id from it, and persists both to the global
 * store so deploy/down/doctor need no env vars.
 */
export async function runLogin(opts: LoginOptions = {}): Promise<LoginResult> {
  const interactive = !opts.nonInteractive && !opts.token && process.stdin.isTTY;
  const url = tokenTemplateUrl();

  if (interactive) p.intro("Sign in to Cloudflare");

  let token = opts.token;
  if (!token) {
    if (!interactive)
      throw new Error("No token provided. Run `edgecms login` in a terminal, or pass --token <value>.");
    p.log.info(
      `Opening the Cloudflare token page (permissions are pre-filled). If it doesn't open, visit:\n${url}\n\nCreate the token, then paste it below. It needs:\n${PERMISSION_CHECKLIST.map((l) => `  • ${l}`).join("\n")}`,
    );
    openBrowser(url);
    const entered = await p.password({
      message: "Paste your API token",
      validate: (v) => (v.trim().length < 10 ? "That doesn't look like a token" : undefined),
    });
    if (p.isCancel(entered)) {
      p.cancel("Sign-in cancelled.");
      throw new Error("cancelled");
    }
    token = entered.trim();
  }

  const spinner = interactive ? p.spinner() : null;
  spinner?.start("Verifying token and finding your account");
  let accounts: CfAccount[];
  try {
    const client = new CfClient({ apiToken: token, accountId: "" }, opts.fetchImpl);
    accounts = await listAccounts(client);
  } catch (err) {
    spinner?.stop("Token verification failed");
    throw new Error(`Could not verify the token: ${err instanceof Error ? err.message : String(err)}`);
  }
  spinner?.stop(`Token verified — ${accounts.length} account${accounts.length === 1 ? "" : "s"} found`);

  const account = await pickAccount(accounts, opts, interactive);
  const creds: CfCredentials = { apiToken: token, accountId: account.id };
  await writeStoredCredentials(creds, opts.home);

  if (interactive) p.outro(`Signed in to "${account.name}". Next: run \`edgecms deploy\`.`);
  return { accountId: account.id, accountName: account.name };
}

async function pickAccount(accounts: CfAccount[], opts: LoginOptions, interactive: boolean): Promise<CfAccount> {
  if (accounts.length === 0) throw new Error("This token has no account access. Check its permissions and try again.");
  if (opts.account) {
    const match = accounts.find((a) => a.id === opts.account);
    if (!match) throw new Error(`Token cannot access account "${opts.account}".`);
    return match;
  }
  if (accounts.length === 1) return accounts[0]!;
  if (!interactive)
    throw new Error(
      `Token can access ${accounts.length} accounts. Re-run with --account <id>. Options:\n${accounts
        .map((a) => `  ${a.id}  ${a.name}`)
        .join("\n")}`,
    );
  const chosen = await p.select({
    message: "Which account?",
    options: accounts.map((a) => ({ value: a.id, label: a.name, hint: a.id })),
  });
  if (p.isCancel(chosen)) {
    p.cancel("Sign-in cancelled.");
    throw new Error("cancelled");
  }
  return accounts.find((a) => a.id === chosen)!;
}

/** Best-effort open in the OS browser. Never throws — the URL is always printed too. */
function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // ignore — the URL was printed for manual opening
  }
}
