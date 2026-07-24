import type { SnapshotCollection } from "@kalayaan/config";
import {
  DEFAULT_LIMIT,
  EdgeCMSError,
  MAX_LIMIT,
  type Query,
  type Sort,
  type Where,
  type WhereOps,
} from "@kalayaan/core";
import type { SqlDialect } from "./dialect.js";
import { columnName, findField, isLocalized } from "./naming.js";

export interface CompiledQuery {
  sql: string;
  params: unknown[];
  /** limit actually applied (before the +1 look-ahead row). */
  limit: number;
  /** Effective sort including the id tiebreak, for cursor encoding. */
  sort: Sort[];
}

const OPS: Record<keyof WhereOps, string> = {
  eq: "=",
  ne: "<>",
  in: "IN",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
  contains: "LIKE",
};

export function encodeCursor(values: unknown[]): string {
  const json = JSON.stringify(values);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeCursor(cursor: string): unknown[] {
  try {
    const b64 = cursor.replaceAll("-", "+").replaceAll("_", "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed;
  } catch {
    throw new EdgeCMSError("bad_request", "Invalid cursor");
  }
}

/**
 * Compile a find query to a single SELECT with keyset pagination.
 * Fetches limit+1 rows so the adapter can tell whether a next page exists.
 */
export function buildFind(query: Query, c: SnapshotCollection, dialect: SqlDialect): CompiledQuery {
  const q = (id: string) => dialect.quoteId(id);
  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.where) {
    const clause = whereClause(query.where, c, params, dialect);
    if (clause) conditions.push(clause);
  }
  if (query.or && query.or.length > 0) {
    const groups = query.or
      .map((group) => whereClause(group, c, params, dialect))
      .filter((g): g is string => g !== null);
    if (groups.length) conditions.push(`(${groups.join(" OR ")})`);
  }
  if (isLocalized(c)) {
    conditions.push(`${q("locale")} = ?`);
    params.push(query.locale ?? c.locales[0]);
  }

  const sort = effectiveSort(query.sort, c);
  if (query.cursor) {
    conditions.push(cursorPredicate(query.cursor, sort, params, dialect));
  }

  const orderBy = sort
    .map((s) => `${sortColumn(s.field, c, dialect)} ${s.dir === "desc" ? "DESC" : "ASC"}`)
    .join(", ");
  const whereSql = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM ${q(c.name)}${whereSql} ORDER BY ${orderBy} LIMIT ${limit + 1}`;
  return { sql, params, limit, sort };
}

function effectiveSort(sort: Sort[] | undefined, c: SnapshotCollection): Sort[] {
  const requested = sort?.length ? sort : [{ field: "created_at", dir: "desc" as const }];
  for (const s of requested) validateSortField(s.field, c);
  if (!requested.some((s) => s.field === "id"))
    return [...requested, { field: "id", dir: requested[requested.length - 1]!.dir }];
  return requested;
}

const SYSTEM_SORTABLE = new Set(["id", "created_at", "updated_at", "published_at"]);

function validateSortField(field: string, c: SnapshotCollection): void {
  if (SYSTEM_SORTABLE.has(field)) return;
  const f = findField(c, field);
  if (!f) throw new EdgeCMSError("bad_request", `Cannot sort by unknown field "${field}"`);
  const type = (f.def as { type: string }).type;
  if (type === "relation" || type === "richText" || type === "media")
    throw new EdgeCMSError("bad_request", `Cannot sort by ${type} field "${field}"`);
}

function sortColumn(field: string, c: SnapshotCollection, dialect: SqlDialect): string {
  if (SYSTEM_SORTABLE.has(field)) return dialect.quoteId(field);
  return dialect.quoteId(columnName(findField(c, field)!));
}

/**
 * Keyset predicate for multi-column sort:
 * (a, b) after (va, vb) ≡ a > va OR (a = va AND b > vb)  — direction-aware.
 */
function cursorPredicate(
  cursor: string,
  sort: Sort[],
  params: unknown[],
  dialect: SqlDialect,
): string {
  const q = (id: string) => dialect.quoteId(id);
  const values = decodeCursor(cursor);
  if (values.length !== sort.length)
    throw new EdgeCMSError("bad_request", "Cursor does not match the requested sort");
  const alternatives: string[] = [];
  for (let i = 0; i < sort.length; i++) {
    const terms: string[] = [];
    for (let j = 0; j < i; j++) {
      terms.push(`${q(sort[j]!.field === "id" ? "id" : sort[j]!.field)} = ?`);
      params.push(values[j]);
    }
    const s = sort[i]!;
    terms.push(`${q(s.field)} ${s.dir === "desc" ? "<" : ">"} ?`);
    params.push(values[i]);
    alternatives.push(`(${terms.join(" AND ")})`);
  }
  return `(${alternatives.join(" OR ")})`;
}

function whereClause(
  where: Where,
  c: SnapshotCollection,
  params: unknown[],
  dialect: SqlDialect,
): string | null {
  const clauses: string[] = [];
  for (const [fieldName, condition] of Object.entries(where)) {
    const column = filterColumn(fieldName, c, dialect);
    const ops = isOps(condition) ? condition : { eq: condition };
    for (const [op, raw] of Object.entries(ops) as [keyof WhereOps, unknown][]) {
      if (raw === undefined) continue;
      if (op === "in") {
        const list = raw as unknown[];
        if (!Array.isArray(list) || list.length === 0)
          throw new EdgeCMSError("bad_request", `"in" filter on "${fieldName}" needs a non-empty array`);
        clauses.push(`${column} IN (${list.map(() => "?").join(", ")})`);
        params.push(...list.map(dialect.encodeParam));
      } else if (op === "contains") {
        clauses.push(`${column} ${dialect.likeOperator} ? ESCAPE '\\'`);
        params.push(`%${String(raw).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
      } else if (op === "eq" && raw === null) {
        clauses.push(`${column} IS NULL`);
      } else if (op === "ne" && raw === null) {
        clauses.push(`${column} IS NOT NULL`);
      } else {
        clauses.push(`${column} ${OPS[op]} ?`);
        params.push(dialect.encodeParam(raw));
      }
    }
  }
  return clauses.length ? clauses.join(" AND ") : null;
}

function filterColumn(fieldName: string, c: SnapshotCollection, dialect: SqlDialect): string {
  if (SYSTEM_SORTABLE.has(fieldName) || fieldName === "locale") return dialect.quoteId(fieldName);
  // entity_id exists only on localized collections (links locale variants).
  if (fieldName === "entity_id" && isLocalized(c)) return dialect.quoteId(fieldName);
  const f = findField(c, fieldName);
  if (!f) throw new EdgeCMSError("bad_request", `Cannot filter by unknown field "${fieldName}"`);
  const type = (f.def as { type: string; many?: boolean }).type;
  if (type === "relation" && (f.def as { many?: boolean }).many)
    throw new EdgeCMSError("bad_request", `Cannot filter by many-relation "${fieldName}"`);
  return dialect.quoteId(columnName(f));
}

function isOps(v: unknown): v is WhereOps {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v).every((k) => k in OPS)
  );
}
