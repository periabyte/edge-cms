import { ulid } from "@kalayaan/core";

export interface MediaRecord {
  id: string;
  key: string;
  filename: string;
  mime: string;
  size: number;
  alt: string | null;
  width: number | null;
  height: number | null;
  createdAt: number;
}

/**
 * Raw queries against the fixed `media` system table (see
 * @kalayaan/adapter-d1's SYSTEM_TABLE_DDL). Object bytes live in R2 under
 * `key`; this table is the queryable, joinable metadata index the `media`
 * field type references via `{field}_id`.
 */
export class MediaStore {
  constructor(private readonly db: D1Database) {}

  async create(input: {
    filename: string;
    mime: string;
    size: number;
    alt?: string | null;
  }): Promise<MediaRecord> {
    const id = ulid();
    const now = Date.now();
    const key = `media/${id}/${sanitizeFilename(input.filename)}`;
    await this.db
      .prepare(
        `INSERT INTO "media" ("id", "key", "filename", "mime", "size", "alt", "created_at") VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, key, input.filename, input.mime, input.size, input.alt ?? null, now)
      .run();
    return {
      id,
      key,
      filename: input.filename,
      mime: input.mime,
      size: input.size,
      alt: input.alt ?? null,
      width: null,
      height: null,
      createdAt: now,
    };
  }

  /** Patch mutable metadata (alt text, dimensions). Missing keys are left unchanged. */
  async update(
    id: string,
    patch: { alt?: string | null; width?: number | null; height?: number | null },
  ): Promise<MediaRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next: MediaRecord = {
      ...existing,
      ...(patch.alt !== undefined && { alt: patch.alt }),
      ...(patch.width !== undefined && { width: patch.width }),
      ...(patch.height !== undefined && { height: patch.height }),
    };
    await this.db
      .prepare(`UPDATE "media" SET "alt" = ?, "width" = ?, "height" = ? WHERE "id" = ?`)
      .bind(next.alt, next.width, next.height, id)
      .run();
    return next;
  }

  async findById(id: string): Promise<MediaRecord | null> {
    const row = await this.db.prepare(`SELECT * FROM "media" WHERE "id" = ?`).bind(id).first<Row>();
    return row ? fromRow(row) : null;
  }

  async list(limit = 50): Promise<MediaRecord[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM "media" ORDER BY "created_at" DESC LIMIT ?`)
      .bind(limit)
      .all<Row>();
    return results.map(fromRow);
  }

  async delete(id: string): Promise<MediaRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.db.prepare(`DELETE FROM "media" WHERE "id" = ?`).bind(id).run();
    return existing;
  }
}

interface Row {
  id: string;
  key: string;
  filename: string;
  mime: string;
  size: number;
  alt: string | null;
  width: number | null;
  height: number | null;
  created_at: number;
}

function fromRow(row: Row): MediaRecord {
  return {
    id: row.id,
    key: row.key,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    alt: row.alt,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "file";
}
