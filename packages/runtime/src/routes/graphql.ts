import { Hono, type Context } from "hono";
import { graphql, type GraphQLSchema } from "graphql";
import type { ResolvedConfig } from "@edgecms/config";
import { buildGraphQLSchema } from "../graphql/schema.js";
import type { ContentEnv } from "./content.js";

/**
 * Config-generated GraphQL read API at `/api/graphql`. Built once per worker
 * from the schema; each request executes against the request's adapter, so
 * visibility matches the REST content API (published only). POST takes
 * `{ query, variables, operationName }`; GET takes `?query=…&variables=…`.
 */
export function graphqlRoutes(config: ResolvedConfig) {
  const app = new Hono<ContentEnv>();
  const schema: GraphQLSchema = buildGraphQLSchema(config);

  async function run(
    c: Context<ContentEnv>,
    source: string,
    variableValues: Record<string, unknown> | undefined,
    operationName: string | undefined,
  ) {
    const result = await graphql({
      schema,
      source,
      contextValue: { adapter: c.var.adapter },
      ...(variableValues && { variableValues }),
      ...(operationName && { operationName }),
    });
    // GraphQL errors are returned in the body with a 200, per the spec.
    return c.json(result);
  }

  app.post("/", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      query?: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    };
    if (!body.query) return c.json({ errors: [{ message: "Missing `query`" }] }, 400);
    return run(c, body.query, body.variables, body.operationName);
  });

  app.get("/", async (c) => {
    const query = c.req.query("query");
    if (!query) return c.json({ errors: [{ message: "Missing `query`" }] }, 400);
    const rawVars = c.req.query("variables");
    let variables: Record<string, unknown> | undefined;
    if (rawVars) {
      try {
        variables = JSON.parse(rawVars) as Record<string, unknown>;
      } catch {
        return c.json({ errors: [{ message: "Invalid `variables` JSON" }] }, 400);
      }
    }
    return run(c, query, variables, c.req.query("operationName"));
  });

  return app;
}
