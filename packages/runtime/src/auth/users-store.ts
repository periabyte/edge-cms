import { ulid } from "@edgecms/core";
import { hashPassword } from "./password.js";

/** Role is a config-defined name (see @edgecms/config `roles`), not a fixed enum. */
export type UserRole = string;

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  /** epoch ms the account was disabled, or null if active. Disabled users can't authenticate. */
  disabledAt: number | null;
  createdAt: number;
  /** Display name — optional, shown in the admin UI instead of the raw email. */
  name: string | null;
}

/** Public projection safe to return over the API (no password hash). */
export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  disabledAt: number | null;
  createdAt: number;
  name: string | null;
}

export function toPublicUser(u: UserRecord): PublicUser {
  return { id: u.id, email: u.email, role: u.role, disabledAt: u.disabledAt, createdAt: u.createdAt, name: u.name };
}

/**
 * Raw queries against the fixed `users` system table (see
 * @edgecms/adapter-d1's SYSTEM_TABLE_DDL). Not config-driven, so it bypasses
 * the generic DatabaseAdapter collection CRUD.
 */
export class UsersStore {
  constructor(private readonly db: D1Database) {}

  async count(): Promise<number> {
    const row = await this.db.prepare(`SELECT COUNT(*) as n FROM "users"`).first<{ n: number }>();
    return row?.n ?? 0;
  }

  /** Count active (non-disabled) users holding one of `roles`. */
  async countActiveByRoles(roles: string[]): Promise<number> {
    if (roles.length === 0) return 0;
    const placeholders = roles.map(() => "?").join(", ");
    const row = await this.db
      .prepare(`SELECT COUNT(*) as n FROM "users" WHERE "disabled_at" IS NULL AND "role" IN (${placeholders})`)
      .bind(...roles)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async list(): Promise<UserRecord[]> {
    const { results } = await this.db.prepare(`SELECT * FROM "users" ORDER BY "created_at" ASC`).all<Row>();
    return results.map(fromRow);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db
      .prepare(`SELECT * FROM "users" WHERE "email" = ?`)
      .bind(email.toLowerCase())
      .first<Row>();
    return row ? fromRow(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.db.prepare(`SELECT * FROM "users" WHERE "id" = ?`).bind(id).first<Row>();
    return row ? fromRow(row) : null;
  }

  async create(email: string, password: string, role: UserRole, name?: string | null): Promise<UserRecord> {
    const id = ulid();
    const now = Date.now();
    const passwordHash = await hashPassword(password);
    await this.db
      .prepare(
        `INSERT INTO "users" ("id", "email", "password_hash", "role", "created_at", "name") VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, email.toLowerCase(), passwordHash, role, now, name ?? null)
      .run();
    return { id, email: email.toLowerCase(), passwordHash, role, disabledAt: null, createdAt: now, name: name ?? null };
  }

  /**
   * Create a user with no local password (external identity, e.g. Cloudflare
   * Access). password_hash stays NULL, so password login can never match.
   */
  async createExternal(email: string, role: UserRole): Promise<UserRecord> {
    const id = ulid();
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO "users" ("id", "email", "password_hash", "role", "created_at") VALUES (?, ?, NULL, ?, ?)`,
      )
      .bind(id, email.toLowerCase(), role, now)
      .run();
    return { id, email: email.toLowerCase(), passwordHash: null, role, disabledAt: null, createdAt: now, name: null };
  }

  async setRole(id: string, role: UserRole): Promise<void> {
    await this.db.prepare(`UPDATE "users" SET "role" = ? WHERE "id" = ?`).bind(role, id).run();
  }

  async setName(id: string, name: string | null): Promise<void> {
    await this.db.prepare(`UPDATE "users" SET "name" = ? WHERE "id" = ?`).bind(name, id).run();
  }

  /** Disable (`disabled=true`) or re-enable a user. Disabled users can't authenticate. */
  async setDisabled(id: string, disabled: boolean): Promise<void> {
    await this.db
      .prepare(`UPDATE "users" SET "disabled_at" = ? WHERE "id" = ?`)
      .bind(disabled ? Date.now() : null, id)
      .run();
  }

  async setPassword(id: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.db.prepare(`UPDATE "users" SET "password_hash" = ? WHERE "id" = ?`).bind(passwordHash, id).run();
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare(`DELETE FROM "users" WHERE "id" = ?`).bind(id).run();
  }
}

interface Row {
  id: string;
  email: string;
  password_hash: string | null;
  role: string;
  disabled_at: number | null;
  created_at: number;
  name: string | null;
}

function fromRow(row: Row): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    disabledAt: row.disabled_at ?? null,
    createdAt: row.created_at,
    name: row.name ?? null,
  };
}
