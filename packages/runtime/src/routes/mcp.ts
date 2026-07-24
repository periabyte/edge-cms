import { Hono } from "hono";
import { EdgeCMSError } from "@kalayaan/core";
import type { ResolvedConfig } from "@kalayaan/config";
import { requireAuth, type Actor, type AuthEnv } from "../auth/middleware.js";
import type { Action } from "@kalayaan/core";
import type { SystemSubject } from "@kalayaan/config";
import { MediaStore } from "../media/media-store.js";
import { searchServiceFrom } from "../ai/search-service.js";
import { serializeDoc } from "../status.js";
import type { MediaEnv } from "./media.js";
import type { ContentEnv } from "./content.js";
import type { VectorizeBinding } from "../ai/search-index.js";
import type { AIProvider } from "@kalayaan/core";

type McpEnv = ContentEnv &
  AuthEnv &
  MediaEnv & { Bindings: { VECTORIZE?: VectorizeBinding }; Variables: { ai?: AIProvider } };

const PROTOCOL_VERSION = "2024-11-05";

interface ToolDef {
  description: string;
  /** Permission action this tool requires. */
  action: Action;
  /**
   * Fixed subject to authorize against. When omitted, the subject is the
   * `collection` argument; tools with neither (pure metadata) skip the check.
   */
  subject?: SystemSubject;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, c: import("hono").Context<McpEnv>, config: ResolvedConfig) => Promise<unknown>;
}

/**
 * Model Context Protocol server over streamable HTTP (JSON-RPC 2.0 at `/mcp`).
 * Authenticated with a scoped API key (Bearer) or a session cookie. Each tool
 * declares the permission action it needs (read/create/update/publish/delete),
 * authorized against the actor's ability on the target collection — the same
 * RBAC model as the REST API, enforced for users and keys alike. Responds with
 * a single JSON message per request — the subset of the streamable-HTTP
 * transport a stateless server may use.
 */
export function mcpRoutes(config: ResolvedConfig) {
  const app = new Hono<McpEnv>();
  const byName = new Map(config.collections.map((c) => [c.name, c]));
  const tools = buildTools(byName);

  app.use("*", requireAuth());

  app.post("/", async (c) => {
    const req = (await c.req.json().catch(() => null)) as JsonRpcRequest | null;
    if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string")
      return c.json(rpcError(null, -32600, "Invalid Request"), 400);

    // Notifications (no id) get an empty 204 — nothing to return.
    if (req.id === undefined || req.id === null) return c.body(null, 204);

    try {
      const result = await handle(req, c, config, tools);
      return c.json({ jsonrpc: "2.0", id: req.id, result });
    } catch (err) {
      if (err instanceof RpcError) return c.json(rpcError(req.id, err.code, err.message));
      const message = err instanceof Error ? err.message : "Internal error";
      return c.json(rpcError(req.id, -32603, message));
    }
  });

  return app;
}

async function handle(
  req: JsonRpcRequest,
  c: import("hono").Context<McpEnv>,
  config: ResolvedConfig,
  tools: Record<string, ToolDef>,
): Promise<unknown> {
  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: `${config.name} (Kalayaan)`, version: "1" },
      };
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: Object.entries(tools).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    case "tools/call": {
      const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      const tool = params.name ? tools[params.name] : undefined;
      if (!tool) throw new RpcError(-32602, `Unknown tool "${params.name}"`);
      requireToolPermission(c.var.actor, tool, params.arguments);
      try {
        const data = await tool.handler(params.arguments ?? {}, c, config);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        // Tool execution errors are reported in-band per MCP, not as RPC errors.
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    }
    default:
      throw new RpcError(-32601, `Method not found: ${req.method}`);
  }
}

/**
 * Enforce a tool's permission against the actor's ability. The subject is the
 * tool's fixed `subject`, else its `collection` argument; metadata tools with
 * neither skip the check. Unlike the old scope model this also constrains user
 * sessions (an editor can create/update but not delete, a viewer is read-only).
 */
function requireToolPermission(actor: Actor, tool: ToolDef, args: Record<string, unknown> | undefined): void {
  const collection = args?.collection;
  const subject = tool.subject ?? (typeof collection === "string" ? collection : undefined);
  if (!subject) return; // pure metadata tool (e.g. list_collections)
  if (!actor.ability.can(tool.action, subject))
    throw new RpcError(-32000, `Not permitted to ${tool.action} "${subject}"`);
}

function buildTools(byName: Map<string, { name: string }>): Record<string, ToolDef> {
  const mustCollection = (name: unknown) => {
    if (typeof name !== "string" || !byName.has(name))
      throw new EdgeCMSError("not_found", `Unknown collection "${String(name)}"`);
    return name;
  };
  const collectionArg = { collection: { type: "string", description: "Collection name" } };

  return {
    list_collections: {
      description: "List the collections and their fields.",
      action: "read",
      inputSchema: { type: "object", properties: {} },
      handler: async (_a, _c, config) =>
        config.collections.map((c2) => ({
          name: c2.name,
          titleField: c2.titleField,
          locales: c2.locales,
          fields: c2.fields.map((f) => ({ name: f.name, ...f.def })),
        })),
    },
    query_documents: {
      description: "Query documents in a collection (admin view: includes drafts).",
      action: "read",
      inputSchema: {
        type: "object",
        required: ["collection"],
        properties: {
          ...collectionArg,
          limit: { type: "number" },
          locale: { type: "string" },
        },
      },
      handler: async (a, c) => {
        const collection = mustCollection(a.collection);
        const page = await c.var.adapter.find({
          collection,
          ...(typeof a.limit === "number" && { limit: a.limit }),
          ...(typeof a.locale === "string" && { locale: a.locale }),
        });
        return { documents: page.docs.map(serializeDoc), cursor: page.cursor };
      },
    },
    get_document: {
      description: "Fetch a single document by id or slug.",
      action: "read",
      inputSchema: {
        type: "object",
        required: ["collection"],
        properties: { ...collectionArg, id: { type: "string" }, slug: { type: "string" }, locale: { type: "string" } },
      },
      handler: async (a, c) => {
        const collection = mustCollection(a.collection);
        const doc = await c.var.adapter.findOne({
          collection,
          ...(a.id ? { id: String(a.id) } : { slug: String(a.slug) }),
          ...(typeof a.locale === "string" && { locale: a.locale }),
        });
        if (!doc) throw new Error("Document not found");
        return serializeDoc(doc);
      },
    },
    search: {
      description: "Semantic search over published documents (falls back to text match).",
      action: "read",
      inputSchema: {
        type: "object",
        required: ["q"],
        properties: { q: { type: "string" }, collection: { type: "string" }, locale: { type: "string" }, limit: { type: "number" } },
      },
      handler: async (a, c, config) => {
        const service = searchServiceFrom(config, c.var.adapter, c.var.ai, c.env.VECTORIZE);
        return service.search({
          q: String(a.q),
          ...(typeof a.collection === "string" && { collection: a.collection }),
          ...(typeof a.locale === "string" && { locale: a.locale }),
          limit: typeof a.limit === "number" ? a.limit : 20,
        });
      },
    },
    create_document: {
      description: "Create a document. `data` holds the field values.",
      action: "create",
      inputSchema: {
        type: "object",
        required: ["collection", "data"],
        properties: { ...collectionArg, data: { type: "object" } },
      },
      handler: async (a, c) => {
        const collection = mustCollection(a.collection);
        const doc = await c.var.adapter.create(collection, (a.data ?? {}) as Record<string, unknown>);
        return serializeDoc(doc);
      },
    },
    update_document: {
      description: "Update a document's fields.",
      action: "update",
      inputSchema: {
        type: "object",
        required: ["collection", "id", "data"],
        properties: { ...collectionArg, id: { type: "string" }, data: { type: "object" } },
      },
      handler: async (a, c) => {
        const collection = mustCollection(a.collection);
        const doc = await c.var.adapter.update(
          { collection, id: String(a.id) },
          (a.data ?? {}) as Record<string, unknown>,
        );
        return serializeDoc(doc);
      },
    },
    publish: {
      description: "Publish a document by setting its published_at to now.",
      action: "publish",
      inputSchema: {
        type: "object",
        required: ["collection", "id"],
        properties: { ...collectionArg, id: { type: "string" } },
      },
      handler: async (a, c) => {
        const collection = mustCollection(a.collection);
        const doc = await c.var.adapter.update({ collection, id: String(a.id) }, { published_at: Date.now() });
        return serializeDoc(doc);
      },
    },
    upload_media_from_url: {
      description: "Download an image/file from a URL and store it as a media asset.",
      action: "create",
      subject: "media",
      inputSchema: {
        type: "object",
        required: ["url"],
        properties: { url: { type: "string" }, filename: { type: "string" } },
      },
      handler: async (a, c) => {
        const url = String(a.url);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const bytes = await res.arrayBuffer();
        const mime = res.headers.get("content-type") ?? "application/octet-stream";
        const filename = typeof a.filename === "string" ? a.filename : url.split("/").pop() || "upload";
        const record = await new MediaStore(c.env.DB).create({ filename, mime, size: bytes.byteLength });
        await c.var.storage.put(record.key, bytes, mime);
        return record;
      },
    },
    delete_document: {
      description: "Delete a document. Requires the `manage` scope.",
      action: "delete",
      inputSchema: {
        type: "object",
        required: ["collection", "id"],
        properties: { ...collectionArg, id: { type: "string" } },
      },
      handler: async (a, c) => {
        const collection = mustCollection(a.collection);
        await c.var.adapter.delete({ collection, id: String(a.id) });
        return { deleted: true, id: a.id };
      },
    },
  } satisfies Record<string, ToolDef>;
}

// ---- JSON-RPC helpers ----

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}
