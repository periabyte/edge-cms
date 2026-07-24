import type { SchemaChange, SchemaSnapshot } from "@kalayaan/config";
import type { Doc, DocRef, Page, Query } from "./query.js";

export interface MigrationPlan {
  statements: { sql: string; destructive: boolean }[];
  destructive: boolean;
}

/**
 * The contract both adapter families implement. Semantics that differ by
 * family are documented per method; the conformance suite pins the rest.
 */
export interface DatabaseAdapter {
  readonly kind: "relational" | "document";

  find(query: Query): Promise<Page>;
  findOne(ref: DocRef): Promise<Doc | null>;
  /** `doc` uses field names (not column names); system fields are generated. */
  create(collection: string, doc: Record<string, unknown>): Promise<Doc>;
  update(ref: DocRef, patch: Record<string, unknown>): Promise<Doc>;
  delete(ref: DocRef): Promise<void>;

  /** Compile schema changes to an executable plan without applying it. */
  planMigration(
    changes: SchemaChange[],
    next: SchemaSnapshot,
    prev: SchemaSnapshot | null,
  ): Promise<MigrationPlan>;
  /** Apply a plan produced by planMigration. */
  applyMigration(plan: MigrationPlan): Promise<void>;

  /**
   * Best-effort atomicity: real transactions on Postgres/MySQL/Mongo sessions,
   * a sequential batch on D1 (no interactive transactions across await points).
   */
  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;
}

export interface StorageObject {
  key: string;
  size: number;
  contentType: string;
}

export interface StorageAdapter {
  put(key: string, body: ReadableStream | ArrayBuffer, contentType: string): Promise<StorageObject>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string; size: number } | null>;
  delete(key: string): Promise<void>;
}
