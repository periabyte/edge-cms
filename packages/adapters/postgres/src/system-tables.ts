/**
 * Postgres flavour of the fixed system tables. Same shape as the SQLite set
 * (see @edgecms/adapter-d1's SYSTEM_TABLE_DDL) with native BIGINT timestamps
 * and BOOLEAN flags. Every statement is idempotent so the migration runner can
 * reconcile them on every deploy.
 */
export const PG_SYSTEM_TABLE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "_migrations" (
  "id" TEXT PRIMARY KEY,
  "checksum" TEXT NOT NULL,
  "applied_at" BIGINT NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "_versions" (
  "id" TEXT PRIMARY KEY,
  "collection" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "locale" TEXT,
  "status" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL,
  "created_by" TEXT
);`,
  `CREATE INDEX IF NOT EXISTS "idx_versions_entity" ON "_versions" ("collection", "entity_id", "created_at");`,
  `CREATE TABLE IF NOT EXISTS "media" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  "alt" TEXT,
  "width" BIGINT,
  "height" BIGINT,
  "created_at" BIGINT NOT NULL
);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_media_key" ON "media" ("key");`,
  `CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "password_hash" TEXT,
  "role" TEXT NOT NULL DEFAULT 'editor',
  "disabled_at" BIGINT,
  "created_at" BIGINT NOT NULL,
  "name" TEXT
);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_users_email" ON "users" ("email");`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT;`,
  `CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL DEFAULT '',
  "scopes" TEXT NOT NULL,
  "expires_at" BIGINT,
  "revoked_at" BIGINT,
  "created_at" BIGINT NOT NULL,
  "last_used_at" BIGINT
);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ux_api_keys_hash" ON "api_keys" ("key_hash");`,
  `CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" TEXT PRIMARY KEY,
  "url" TEXT NOT NULL,
  "events" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" BIGINT NOT NULL
);`,
  `CREATE TABLE IF NOT EXISTS "saved_filters" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "collection" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "query_json" TEXT NOT NULL,
  "created_at" BIGINT NOT NULL
);`,
  `CREATE INDEX IF NOT EXISTS "idx_saved_filters_user" ON "saved_filters" ("user_id", "collection");`,
  `CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" TEXT PRIMARY KEY,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "target_id" TEXT,
  "detail" TEXT,
  "created_at" BIGINT NOT NULL
);`,
  `CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "audit_log" ("created_at");`,
];
