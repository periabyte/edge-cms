import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CfCredentials } from "./cf/client.js";

/**
 * Global (per-user, not per-project) credential store written by `kalayaan login`
 * and read by deploy/down/doctor when no env vars are set. Lives in the home dir
 * — credentials are a machine-level concern, not something to keep in a project
 * (or its gitignored `.kalayaan/`). Mirrors the JSON read/write shape in state.ts.
 */

export function credentialsDir(home: string = homedir()): string {
  return join(home, ".kalayaan");
}

export function credentialsPath(home: string = homedir()): string {
  return join(credentialsDir(home), "credentials.json");
}

export async function readStoredCredentials(home: string = homedir()): Promise<CfCredentials | null> {
  const path = credentialsPath(home);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(await readFile(path, "utf-8")) as Partial<CfCredentials>;
    if (!parsed.apiToken || !parsed.accountId) return null;
    return { apiToken: parsed.apiToken, accountId: parsed.accountId };
  } catch {
    return null;
  }
}

export async function writeStoredCredentials(creds: CfCredentials, home: string = homedir()): Promise<void> {
  await mkdir(credentialsDir(home), { recursive: true });
  // 0600: the file holds a bearer token — readable only by the owner.
  await writeFile(credentialsPath(home), JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
}

export async function clearStoredCredentials(home: string = homedir()): Promise<boolean> {
  const path = credentialsPath(home);
  if (!existsSync(path)) return false;
  await rm(path);
  return true;
}
