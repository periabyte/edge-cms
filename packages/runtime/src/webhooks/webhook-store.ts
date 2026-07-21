import { ulid } from "@edgecms/core";
import { randomToken } from "../auth/tokens.js";

export const WEBHOOK_EVENTS = ["document.published", "document.updated", "document.deleted"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookRecord {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdAt: number;
}

/** A webhook without its signing secret — safe to return from list/read endpoints. */
export type PublicWebhook = Omit<WebhookRecord, "secret">;

/**
 * CRUD over the fixed `webhooks` system table. The signing secret is generated
 * server-side and only ever returned once (on create / rotate).
 */
export class WebhookStore {
  constructor(private readonly db: D1Database) {}

  async create(input: { url: string; events: WebhookEvent[]; active?: boolean | undefined }): Promise<WebhookRecord> {
    const id = ulid();
    const now = Date.now();
    const secret = randomToken(32);
    const active = input.active ?? true;
    await this.db
      .prepare(`INSERT INTO "webhooks" ("id","url","events","secret","active","created_at") VALUES (?,?,?,?,?,?)`)
      .bind(id, input.url, JSON.stringify(input.events), secret, active ? 1 : 0, now)
      .run();
    return { id, url: input.url, events: input.events, secret, active, createdAt: now };
  }

  async list(): Promise<WebhookRecord[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM "webhooks" ORDER BY "created_at" DESC`)
      .all<Row>();
    return results.map(fromRow);
  }

  async findById(id: string): Promise<WebhookRecord | null> {
    const row = await this.db.prepare(`SELECT * FROM "webhooks" WHERE "id" = ?`).bind(id).first<Row>();
    return row ? fromRow(row) : null;
  }

  async update(
    id: string,
    patch: { url?: string | undefined; events?: WebhookEvent[] | undefined; active?: boolean | undefined },
  ): Promise<WebhookRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next: WebhookRecord = {
      ...existing,
      ...(patch.url !== undefined && { url: patch.url }),
      ...(patch.events !== undefined && { events: patch.events }),
      ...(patch.active !== undefined && { active: patch.active }),
    };
    await this.db
      .prepare(`UPDATE "webhooks" SET "url" = ?, "events" = ?, "active" = ? WHERE "id" = ?`)
      .bind(next.url, JSON.stringify(next.events), next.active ? 1 : 0, id)
      .run();
    return next;
  }

  async rotateSecret(id: string): Promise<string | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const secret = randomToken(32);
    await this.db.prepare(`UPDATE "webhooks" SET "secret" = ? WHERE "id" = ?`).bind(secret, id).run();
    return secret;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;
    await this.db.prepare(`DELETE FROM "webhooks" WHERE "id" = ?`).bind(id).run();
    return true;
  }

  /** Active webhooks subscribed to the given event. */
  async listActiveForEvent(event: WebhookEvent): Promise<WebhookRecord[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM "webhooks" WHERE "active" = 1`)
      .all<Row>();
    return results.map(fromRow).filter((w) => w.events.includes(event));
  }
}

export function stripSecret(w: WebhookRecord): PublicWebhook {
  const { secret: _secret, ...rest } = w;
  return rest;
}

interface Row {
  id: string;
  url: string;
  events: string;
  secret: string;
  active: number;
  created_at: number;
}

function fromRow(row: Row): WebhookRecord {
  return {
    id: row.id,
    url: row.url,
    events: JSON.parse(row.events) as WebhookEvent[],
    secret: row.secret,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}
