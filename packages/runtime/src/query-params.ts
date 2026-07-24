import { EdgeCMSError, type Query, type Sort, type Where, type WhereOps } from "@kalayaan/core";
import type { FieldDef, ResolvedCollection } from "@kalayaan/config";

const OPS = new Set(["eq", "ne", "in", "lt", "lte", "gt", "gte", "contains"]);

/**
 * Parses the public/admin query-param grammar into the shared DSL:
 *   filter[field]=value               -> { field: { eq: value } }
 *   filter[field][gte]=value          -> { field: { gte: value } }
 *   filter[field][in]=a,b,c           -> { field: { in: [a,b,c] } }
 *   sort=-published_at,title          -> [{field:"published_at",dir:"desc"},{field:"title",dir:"asc"}]
 *   limit=10&cursor=...&populate=author,tags&locale=de
 */
export function parseContentQuery(search: URLSearchParams, collection: ResolvedCollection): Query {
  const where: Where = {};

  for (const [key, raw] of search.entries()) {
    const match = /^filter\[([^\]]+)\](?:\[([^\]]+)\])?$/.exec(key);
    if (!match) continue;
    const [, fieldName, op = "eq"] = match;
    if (!fieldName || !OPS.has(op))
      throw new EdgeCMSError("bad_request", `Unsupported filter operator in "${key}"`);
    const def = fieldTypeOf(collection, fieldName);
    const value: unknown = op === "in" ? raw.split(",").map((v) => coerce(v, def)) : coerce(raw, def);
    const existing = (where[fieldName] as WhereOps | undefined) ?? {};
    where[fieldName] = { ...existing, [op]: value };
  }

  const query: Query = { collection: collection.name };
  if (Object.keys(where).length) query.where = where;

  const sortParam = search.get("sort");
  if (sortParam) {
    const sort: Sort[] = sortParam.split(",").map((token) => {
      const desc = token.startsWith("-");
      return { field: desc ? token.slice(1) : token, dir: desc ? "desc" : "asc" };
    });
    query.sort = sort;
  }

  const limitParam = search.get("limit");
  if (limitParam) {
    const n = Number(limitParam);
    if (!Number.isInteger(n) || n <= 0)
      throw new EdgeCMSError("bad_request", `Invalid limit "${limitParam}"`);
    query.limit = n;
  }

  const cursor = search.get("cursor");
  if (cursor) query.cursor = cursor;

  const populate = search.get("populate");
  if (populate) query.populate = populate.split(",");

  const locale = search.get("locale");
  if (locale) {
    if (collection.locales.length && !collection.locales.includes(locale))
      throw new EdgeCMSError("bad_request", `"${locale}" is not a configured locale`);
    query.locale = locale;
  }

  return query;
}

function fieldTypeOf(collection: ResolvedCollection, name: string): FieldDef["type"] | null {
  if (name === "id" || name === "created_at" || name === "updated_at" || name === "published_at")
    return "number";
  return collection.fields.find((f) => f.name === name)?.def.type ?? null;
}

function coerce(raw: string, type: FieldDef["type"] | null): unknown {
  switch (type) {
    case "number":
      return Number(raw);
    case "boolean":
      return raw === "true";
    default:
      return raw;
  }
}
