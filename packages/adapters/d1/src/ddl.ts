import type { SchemaChange, SchemaSnapshot, SnapshotCollection, SnapshotField } from "@kalayaan/config";
import {
  emitDDL as emitDDLWith,
  createCollection as createCollectionWith,
  columnNameFor,
  joinTableNameFor,
  type SqlStatement,
} from "@kalayaan/adapter-relational";
import { sqliteDialect } from "./dialect.js";

export type { SqlStatement };

/** SQLite/D1 DDL emitter — the shared emitter bound to the SQLite dialect. */
export function emitDDL(
  changes: SchemaChange[],
  next: SchemaSnapshot,
  prev: SchemaSnapshot | null,
): SqlStatement[] {
  return emitDDLWith(sqliteDialect, changes, next, prev);
}

export function createCollection(c: SnapshotCollection): string[] {
  return createCollectionWith(sqliteDialect, c);
}

export function columnName(f: SnapshotField): string {
  return columnNameFor(f);
}

export function joinTableName(collection: string, fieldName: string): string {
  return joinTableNameFor(collection, fieldName);
}
