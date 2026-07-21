import type { SchemaSnapshot, SnapshotCollection, SnapshotField } from "./snapshot.js";

/**
 * Dialect-agnostic schema change set. Adapters compile these into DDL
 * (relational) or collection/index/validator operations (document).
 */
export type SchemaChange =
  | { kind: "create_collection"; collection: SnapshotCollection }
  | { kind: "drop_collection"; name: string }
  | { kind: "add_field"; collection: string; field: SnapshotField }
  | { kind: "drop_field"; collection: string; field: string }
  | { kind: "alter_field"; collection: string; before: SnapshotField; after: SnapshotField }
  | { kind: "set_localization"; collection: string; before: string[]; after: string[] };

export function isDestructive(change: SchemaChange): boolean {
  switch (change.kind) {
    case "drop_collection":
    case "drop_field":
      return true;
    case "alter_field": {
      const b = change.before.def;
      const a = change.after.def;
      if (b.type !== a.type) return true;
      // Narrowing a select can orphan existing values.
      if (b.type === "select") {
        const before = b.options as string[];
        const after = a.options as string[];
        if (before.some((o) => !after.includes(o))) return true;
      }
      return false;
    }
    case "set_localization":
      // Removing a locale drops that locale's rows from uniqueness guarantees.
      return change.before.some((l) => !change.after.includes(l));
    default:
      return false;
  }
}

/** Diff two snapshots. `prev` is null on first migration. */
export function diffSnapshots(prev: SchemaSnapshot | null, next: SchemaSnapshot): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const prevCollections = new Map((prev?.collections ?? []).map((c) => [c.name, c]));
  const nextCollections = new Map(next.collections.map((c) => [c.name, c]));

  for (const [name, collection] of nextCollections) {
    if (!prevCollections.has(name)) changes.push({ kind: "create_collection", collection });
  }
  for (const name of prevCollections.keys()) {
    if (!nextCollections.has(name)) changes.push({ kind: "drop_collection", name });
  }

  for (const [name, after] of nextCollections) {
    const before = prevCollections.get(name);
    if (!before) continue;

    const beforeFields = new Map(before.fields.map((f) => [f.name, f]));
    const afterFields = new Map(after.fields.map((f) => [f.name, f]));

    for (const [fname, f] of afterFields) {
      const prevField = beforeFields.get(fname);
      if (!prevField) {
        changes.push({ kind: "add_field", collection: name, field: f });
      } else if (JSON.stringify(prevField.def) !== JSON.stringify(f.def)) {
        changes.push({ kind: "alter_field", collection: name, before: prevField, after: f });
      }
    }
    for (const fname of beforeFields.keys()) {
      if (!afterFields.has(fname)) changes.push({ kind: "drop_field", collection: name, field: fname });
    }

    if (JSON.stringify(before.locales) !== JSON.stringify(after.locales)) {
      changes.push({
        kind: "set_localization",
        collection: name,
        before: [...before.locales],
        after: [...after.locales],
      });
    }
  }

  return changes;
}
