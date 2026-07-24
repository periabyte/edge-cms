import { ulid, type Doc } from "@kalayaan/core";

/**
 * The recorded status of a version snapshot. `draft`/`published`/`scheduled`
 * mirror the computed document status at write time; `mt-review` marks a
 * machine-translated revision awaiting human review (written by the translate
 * flow); `autosave` is reserved for a future field-level autosave transport
 * and is not produced today.
 */
export type VersionStatus = "draft" | "published" | "scheduled" | "mt-review" | "autosave";

export interface VersionRecord {
  id: string;
  collection: string;
  entityId: string;
  locale: string | null;
  status: VersionStatus;
  /** JSON-serialized full document snapshot. */
  snapshot: string;
  createdAt: number;
  createdBy: string | null;
}

/** A version row without the (potentially large) snapshot body, for list views. */
export type VersionSummary = Omit<VersionRecord, "snapshot">;

/**
 * Append-only history of document snapshots, backed by the fixed `_versions`
 * system table (see @kalayaan/adapter-d1's SYSTEM_TABLE_DDL). One row is written
 * per admin create/update/publish. History is never rewound or deleted —
 * restoring an old version writes a *new* version.
 */
export class VersionStore {
  constructor(private readonly db: D1Database) {}

  /** Record a snapshot of a just-written document. */
  async record(input: {
    collection: string;
    doc: Doc;
    status: VersionStatus;
    createdBy: string | null;
  }): Promise<VersionRecord> {
    const id = ulid();
    const now = Date.now();
    const entityId = (input.doc.entity_id as string | undefined) ?? input.doc.id;
    const locale = (input.doc.locale as string | undefined) ?? null;
    const snapshot = JSON.stringify(input.doc);
    await this.db
      .prepare(
        `INSERT INTO "_versions" ("id", "collection", "entity_id", "locale", "status", "snapshot", "created_at", "created_by") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.collection, entityId, locale, input.status, snapshot, now, input.createdBy)
      .run();
    return { id, collection: input.collection, entityId, locale, status: input.status, snapshot, createdAt: now, createdBy: input.createdBy };
  }

  /** Newest-first list of version summaries for one entity (no snapshot bodies). */
  async list(collection: string, entityId: string, limit = 50): Promise<VersionSummary[]> {
    const { results } = await this.db
      .prepare(
        `SELECT "id", "collection", "entity_id", "locale", "status", "created_at", "created_by"
         FROM "_versions" WHERE "collection" = ? AND "entity_id" = ?
         ORDER BY "created_at" DESC, "id" DESC LIMIT ?`,
      )
      .bind(collection, entityId, limit)
      .all<Omit<Row, "snapshot">>();
    return results.map(summaryFromRow);
  }

  async findById(id: string): Promise<VersionRecord | null> {
    const row = await this.db.prepare(`SELECT * FROM "_versions" WHERE "id" = ?`).bind(id).first<Row>();
    return row ? fromRow(row) : null;
  }

  /**
   * For a set of entities in one collection, return the status of each entity's
   * newest version. Used to derive the admin-only `mt` (machine-translation
   * review) flag without a document column. Empty input → empty map.
   */
  async latestStatuses(collection: string, entityIds: string[]): Promise<Map<string, VersionStatus>> {
    const out = new Map<string, VersionStatus>();
    if (entityIds.length === 0) return out;
    const placeholders = entityIds.map(() => "?").join(", ");
    const { results } = await this.db
      .prepare(
        `SELECT v."entity_id" AS entity_id, v."status" AS status
         FROM "_versions" v
         JOIN (
           SELECT "entity_id", MAX("created_at") AS max_at
           FROM "_versions" WHERE "collection" = ? AND "entity_id" IN (${placeholders})
           GROUP BY "entity_id"
         ) latest ON latest."entity_id" = v."entity_id" AND latest."max_at" = v."created_at"
         WHERE v."collection" = ?`,
      )
      .bind(collection, ...entityIds, collection)
      .all<{ entity_id: string; status: VersionStatus }>();
    for (const r of results) if (!out.has(r.entity_id)) out.set(r.entity_id, r.status);
    return out;
  }
}

interface Row {
  id: string;
  collection: string;
  entity_id: string;
  locale: string | null;
  status: VersionStatus;
  snapshot: string;
  created_at: number;
  created_by: string | null;
}

function summaryFromRow(row: Omit<Row, "snapshot">): VersionSummary {
  return {
    id: row.id,
    collection: row.collection,
    entityId: row.entity_id,
    locale: row.locale,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function fromRow(row: Row): VersionRecord {
  return { ...summaryFromRow(row), snapshot: row.snapshot };
}
