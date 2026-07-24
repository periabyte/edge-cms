// Subpath export `kalayaan/mysql`: see ./postgres.ts. Kept out of the main entry
// so D1 projects never bundle the MySQL driver (mysql2).
import { MysqlAdapter, connectMysql } from "@kalayaan/adapter-mysql";
import type { DatabaseAdapterFactory } from "@kalayaan/runtime";

export const mysqlAdapter: DatabaseAdapterFactory = async (env, snapshot) => {
  if (!env.HYPERDRIVE) throw new Error("MySQL requires a HYPERDRIVE binding");
  const { client, close } = await connectMysql(env.HYPERDRIVE.connectionString);
  return { adapter: new MysqlAdapter(client, snapshot), close };
};
