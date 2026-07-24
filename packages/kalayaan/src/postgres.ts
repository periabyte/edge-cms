// Subpath export `kalayaan/postgres`: the Postgres adapter factory the generated
// Worker entry wires into createApp for `database.adapter: "postgres"` projects.
// Kept out of the main entry so D1 projects never bundle the Postgres driver.
import { PostgresAdapter, connectPostgres } from "@kalayaan/adapter-postgres";
import type { DatabaseAdapterFactory } from "@kalayaan/runtime";

export const postgresAdapter: DatabaseAdapterFactory = async (env, snapshot) => {
  if (!env.HYPERDRIVE) throw new Error("Postgres requires a HYPERDRIVE binding");
  const { client, close } = await connectPostgres(env.HYPERDRIVE.connectionString);
  return { adapter: new PostgresAdapter(client, snapshot), close };
};
