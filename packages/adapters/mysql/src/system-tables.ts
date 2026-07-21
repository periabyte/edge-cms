/**
 * MySQL flavour of the fixed system tables. Backtick-free here (the strings are
 * portable ANSI-ish and MySQL accepts double quotes with ANSI_QUOTES off only
 * for values, so identifiers use backticks). VARCHAR keys, BIGINT timestamps,
 * TINYINT flags. Every statement is idempotent.
 */
export const MYSQL_SYSTEM_TABLE_DDL: string[] = [
  "CREATE TABLE IF NOT EXISTS `_migrations` (\n" +
    "  `id` VARCHAR(255) PRIMARY KEY,\n" +
    "  `checksum` VARCHAR(255) NOT NULL,\n" +
    "  `applied_at` BIGINT NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS `_versions` (\n" +
    "  `id` VARCHAR(255) PRIMARY KEY,\n" +
    "  `collection` VARCHAR(255) NOT NULL,\n" +
    "  `entity_id` VARCHAR(255) NOT NULL,\n" +
    "  `locale` VARCHAR(255),\n" +
    "  `status` VARCHAR(255) NOT NULL,\n" +
    "  `snapshot` LONGTEXT NOT NULL,\n" +
    "  `created_at` BIGINT NOT NULL,\n" +
    "  `created_by` VARCHAR(255),\n" +
    "  INDEX `idx_versions_entity` (`collection`, `entity_id`, `created_at`)\n);",
  "CREATE TABLE IF NOT EXISTS `media` (\n" +
    "  `id` VARCHAR(255) PRIMARY KEY,\n" +
    "  `key` VARCHAR(255) NOT NULL,\n" +
    "  `filename` VARCHAR(255) NOT NULL,\n" +
    "  `mime` VARCHAR(255) NOT NULL,\n" +
    "  `size` BIGINT NOT NULL,\n" +
    "  `alt` TEXT,\n" +
    "  `width` BIGINT,\n" +
    "  `height` BIGINT,\n" +
    "  `created_at` BIGINT NOT NULL,\n" +
    "  UNIQUE KEY `ux_media_key` (`key`)\n);",
  "CREATE TABLE IF NOT EXISTS `users` (\n" +
    "  `id` VARCHAR(255) PRIMARY KEY,\n" +
    "  `email` VARCHAR(255) NOT NULL,\n" +
    "  `password_hash` VARCHAR(255),\n" +
    "  `role` VARCHAR(64) NOT NULL DEFAULT 'editor',\n" +
    "  `disabled_at` BIGINT,\n" +
    "  `created_at` BIGINT NOT NULL,\n" +
    "  `name` VARCHAR(255),\n" +
    "  UNIQUE KEY `ux_users_email` (`email`)\n);",
  "CREATE TABLE IF NOT EXISTS `api_keys` (\n" +
    "  `id` VARCHAR(255) PRIMARY KEY,\n" +
    "  `name` VARCHAR(255) NOT NULL,\n" +
    "  `key_hash` VARCHAR(255) NOT NULL,\n" +
    "  `key_prefix` VARCHAR(32) NOT NULL DEFAULT '',\n" +
    "  `scopes` TEXT NOT NULL,\n" +
    "  `expires_at` BIGINT,\n" +
    "  `revoked_at` BIGINT,\n" +
    "  `created_at` BIGINT NOT NULL,\n" +
    "  `last_used_at` BIGINT,\n" +
    "  UNIQUE KEY `ux_api_keys_hash` (`key_hash`)\n);",
  "CREATE TABLE IF NOT EXISTS `webhooks` (\n" +
    "  `id` VARCHAR(255) PRIMARY KEY,\n" +
    "  `url` TEXT NOT NULL,\n" +
    "  `events` TEXT NOT NULL,\n" +
    "  `secret` VARCHAR(255) NOT NULL,\n" +
    "  `active` TINYINT(1) NOT NULL DEFAULT 1,\n" +
    "  `created_at` BIGINT NOT NULL\n);",
  "CREATE TABLE IF NOT EXISTS `saved_filters` (\n" +
    "  `id` VARCHAR(255) PRIMARY KEY,\n" +
    "  `user_id` VARCHAR(255) NOT NULL,\n" +
    "  `collection` VARCHAR(255) NOT NULL,\n" +
    "  `name` VARCHAR(255) NOT NULL,\n" +
    "  `query_json` TEXT NOT NULL,\n" +
    "  `created_at` BIGINT NOT NULL,\n" +
    "  INDEX `idx_saved_filters_user` (`user_id`, `collection`)\n);",
  "CREATE TABLE IF NOT EXISTS `audit_log` (\n" +
    "  `id` VARCHAR(255) PRIMARY KEY,\n" +
    "  `actor_type` VARCHAR(32) NOT NULL,\n" +
    "  `actor_id` VARCHAR(255),\n" +
    "  `action` VARCHAR(64) NOT NULL,\n" +
    "  `subject` VARCHAR(255) NOT NULL,\n" +
    "  `target_id` VARCHAR(255),\n" +
    "  `detail` TEXT,\n" +
    "  `created_at` BIGINT NOT NULL,\n" +
    "  INDEX `idx_audit_created` (`created_at`)\n);",
];

/**
 * Additive columns for projects deployed before the column existed, executed
 * separately from `MYSQL_SYSTEM_TABLE_DDL` and tolerated as best-effort (not
 * every MySQL-compatible target reliably supports `ADD COLUMN IF NOT
 * EXISTS`) — see `SYSTEM_TABLE_RECONCILE_DDL` in `@edgecms/adapter-d1` for
 * the execution convention. A no-op in effect on fresh installs.
 */
export const MYSQL_SYSTEM_TABLE_RECONCILE_DDL: string[] = [
  "ALTER TABLE `users` ADD COLUMN `name` VARCHAR(255);",
];
