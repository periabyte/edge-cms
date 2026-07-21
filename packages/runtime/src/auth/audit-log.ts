import { ulid } from "@edgecms/core";
import type { Actor } from "./middleware.js";

export interface AuditEntry {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  subject: string;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: number;
}

export interface RecordAudit {
  actor: Actor;
  action: string;
  subject: string;
  targetId?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Append-only audit trail for security-relevant management actions (user and
 * API-key changes, role updates). Writes are best-effort — an audit failure
 * must never break the underlying operation.
 */
export class AuditLog {
  constructor(private readonly db: D1Database) {}

  async record(entry: RecordAudit): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO "audit_log" ("id", "actor_type", "actor_id", "action", "subject", "target_id", "detail", "created_at")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          ulid(),
          entry.actor.type,
          entry.actor.id,
          entry.action,
          entry.subject,
          entry.targetId ?? null,
          entry.detail ? JSON.stringify(entry.detail) : null,
          Date.now(),
        )
        .run();
    } catch {
      // Never let auditing failures surface to the caller.
    }
  }

  async list(limit = 100): Promise<AuditEntry[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM "audit_log" ORDER BY "created_at" DESC LIMIT ?`)
      .bind(Math.min(limit, 500))
      .all<Row>();
    return results.map(fromRow);
  }
}

interface Row {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  subject: string;
  target_id: string | null;
  detail: string | null;
  created_at: number;
}

function fromRow(row: Row): AuditEntry {
  return {
    id: row.id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    subject: row.subject,
    targetId: row.target_id,
    detail: row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null,
    createdAt: row.created_at,
  };
}
