import type { ResolvedConfig } from "./types.js";

/**
 * Canonical schema snapshot — the persisted baseline that migration diffs run against.
 * Only schema-affecting data is included (no hooks, ui, ai, auth), collections and
 * fields are sorted, and serialization is deterministic: the same logical schema
 * always produces byte-identical output.
 */
export interface SchemaSnapshot {
  snapshotVersion: 1;
  collections: SnapshotCollection[];
}

export interface SnapshotCollection {
  name: string;
  fields: SnapshotField[];
  versioning: boolean;
  locales: string[];
}

export interface SnapshotField {
  name: string;
  /** The full field def, canonicalized (sorted keys, no undefined). */
  def: Record<string, unknown>;
}

export function snapshotOf(config: ResolvedConfig): SchemaSnapshot {
  return {
    snapshotVersion: 1,
    collections: [...config.collections]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        name: c.name,
        fields: [...c.fields]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((f) => ({ name: f.name, def: canonicalize(f.def) as Record<string, unknown> })),
        versioning: c.versioning,
        locales: [...c.locales],
      })),
  };
}

export function serializeSnapshot(snapshot: SchemaSnapshot): string {
  return JSON.stringify(canonicalize(snapshot), null, 2) + "\n";
}

export function parseSnapshot(json: string): SchemaSnapshot {
  const parsed = JSON.parse(json) as SchemaSnapshot;
  if (parsed.snapshotVersion !== 1)
    throw new Error(`Unsupported schema snapshot version: ${String(parsed.snapshotVersion)}`);
  return parsed;
}

/** Recursively sort object keys and drop undefined values. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}
