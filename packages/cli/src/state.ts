import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SchemaSnapshot } from "@kalayaan/config";

export interface MigrationRecord {
  id: string;
  checksum: string;
  appliedAt: number;
}

export interface ResourceIds {
  d1?: { id: string; name: string };
  r2?: { name: string };
  kv?: { cache: string; sessions: string };
  queue?: { name: string };
  vectorize?: { name: string };
  hyperdrive?: { id: string };
  worker?: { name: string; secretsInitialized?: boolean };
  /** Attached Workers custom domains (for detach on `down`). */
  domains?: { hostname: string; id: string }[];
  /**
   * The email from-address's domain, onboarded for Email Routing + Sending.
   * Deliberately never torn down by `down` — disabling email at the zone
   * level could affect real mail on that domain well beyond this deployment.
   */
  emailDomain?: { hostname: string; zoneId: string };
}

export interface EdgeCmsState {
  version: 1;
  resources: ResourceIds;
  schema: { snapshotVersion: 1; collections: SchemaSnapshot["collections"] } | null;
  migrations: MigrationRecord[];
}

export function statePath(projectDir: string): string {
  return join(projectDir, ".kalayaan", "state.json");
}

export function emptyState(): EdgeCmsState {
  return { version: 1, resources: {}, schema: null, migrations: [] };
}

export async function readState(projectDir: string): Promise<EdgeCmsState> {
  const path = statePath(projectDir);
  if (!existsSync(path)) return emptyState();
  return JSON.parse(await readFile(path, "utf-8")) as EdgeCmsState;
}

export async function writeState(projectDir: string, state: EdgeCmsState): Promise<void> {
  await mkdir(join(projectDir, ".kalayaan"), { recursive: true });
  await writeFile(statePath(projectDir), JSON.stringify(state, null, 2) + "\n");
}

export function lastSnapshot(state: EdgeCmsState): SchemaSnapshot | null {
  if (!state.schema) return null;
  return { snapshotVersion: state.schema.snapshotVersion, collections: state.schema.collections };
}
