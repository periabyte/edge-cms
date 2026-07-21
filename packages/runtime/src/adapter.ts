import type { SchemaSnapshot } from "@edgecms/config";
import type { DatabaseAdapter } from "@edgecms/core";
import { D1Adapter } from "@edgecms/adapter-d1";

/** A Hyperdrive binding exposes a pooled connection string to the origin DB. */
export interface HyperdriveBinding {
  connectionString: string;
}

export interface AdapterEnv {
  DB: D1Database;
  HYPERDRIVE?: HyperdriveBinding;
}

export interface AdapterHandle {
  adapter: DatabaseAdapter;
  /** Called (via waitUntil) after the response for engines with a live connection. */
  close?: () => Promise<void>;
}

/**
 * Builds the DatabaseAdapter for a request. D1 is the default and needs no
 * factory. Postgres/MySQL factories live in the `edgecms/postgres` and
 * `edgecms/mysql` subpaths and are wired in by the CLI-generated Worker entry
 * only for those engines — so a D1 project's bundle never references the
 * external drivers (`mysql2`/`postgres`) at all.
 */
export type DatabaseAdapterFactory = (
  env: AdapterEnv,
  snapshot: SchemaSnapshot,
) => Promise<AdapterHandle> | AdapterHandle;

export const d1AdapterFactory: DatabaseAdapterFactory = (env, snapshot) => ({
  adapter: new D1Adapter(env.DB, snapshot),
});
