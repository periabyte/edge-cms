import { Hono } from "hono";
import { z } from "zod";
import { EdgeCMSError, abilityForRole } from "@edgecms/core";
import type { PermissionGrant } from "@edgecms/config";
import { ApiKeysStore, grantsFromScopes } from "../auth/api-keys.js";
import { AuditLog } from "../auth/audit-log.js";
import { issueCsrfCookie } from "../auth/csrf.js";
import { requireAuth, requirePermission, rolesOf, type AuthEnv } from "../auth/middleware.js";
import { createSession, destroySession } from "../auth/session.js";
import { UsersStore } from "../auth/users-store.js";
import { verifyPassword } from "../auth/password.js";
import { verifyInviteToken } from "../auth/invite-token.js";

const acceptInviteSchema = z.object({ token: z.string().min(1), password: z.string().min(8) });

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

const permissionActionEnum = z.enum(["read", "create", "update", "delete", "publish", "manage"]);
const grantSchema = z.object({
  subjects: z.union([z.literal("*"), z.array(z.string().min(1)).nonempty()]),
  actions: z.union([z.literal("*"), z.array(permissionActionEnum).nonempty()]),
});

const apiKeyCreateSchema = z
  .object({
    name: z.string().min(1),
    /** Preferred: explicit permission grants. */
    grants: z.array(grantSchema).nonempty().optional(),
    /** Legacy convenience: coarse scopes (+ optional collection allowlist). */
    scopes: z.array(z.enum(["read", "write", "manage"])).nonempty().optional(),
    collections: z.array(z.string()).optional(),
    /** epoch ms; omit for a non-expiring key. */
    expiresAt: z.number().int().positive().optional(),
  })
  .refine((b) => b.grants || b.scopes, { message: "Provide either grants or scopes" });

export function authRoutes() {
  const app = new Hono<AuthEnv>();

  // Public first-run status: lets the admin SPA show a dedicated "create your
  // first administrator" screen and lets `kalayaan deploy` poll for readiness.
  app.get("/setup", async (c) => {
    const needsSetup = (await new UsersStore(c.env.DB).count()) === 0;
    return c.json({ needsSetup });
  });

  // First-run only: creates the initial admin user. Gated on zero users
  // existing rather than a token, so `kalayaan deploy` needs no extra secret.
  app.post("/setup", async (c) => {
    const users = new UsersStore(c.env.DB);
    if ((await users.count()) > 0)
      throw new EdgeCMSError("forbidden", "Setup has already been completed");
    const { email, password } = credentialsSchema.parse(await c.req.json());
    const user = await users.create(email, password, "admin");
    await createSession(c, c.env.SESSIONS, c.env.SESSION_SECRET, user.id);
    const csrfToken = issueCsrfCookie(c);
    return c.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, csrfToken }, 201);
  });

  app.post("/login", async (c) => {
    const { email, password } = credentialsSchema.parse(await c.req.json());
    const user = await new UsersStore(c.env.DB).findByEmail(email);
    if (!user?.passwordHash || user.disabledAt != null || !(await verifyPassword(password, user.passwordHash)))
      throw new EdgeCMSError("unauthorized", "Invalid email or password");
    await createSession(c, c.env.SESSIONS, c.env.SESSION_SECRET, user.id);
    const csrfToken = issueCsrfCookie(c);
    return c.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, csrfToken });
  });

  app.post("/logout", async (c) => {
    await destroySession(c, c.env.SESSIONS, c.env.SESSION_SECRET);
    return c.body(null, 204);
  });

  // Public: an invited user sets their own password via a signed link, replacing
  // the random temporary password issued at invite time.
  app.post("/accept-invite", async (c) => {
    const { token, password } = acceptInviteSchema.parse(await c.req.json());
    const userId = await verifyInviteToken(token, c.env.SESSION_SECRET);
    if (!userId) throw new EdgeCMSError("unauthorized", "Invalid or expired invite");
    const users = new UsersStore(c.env.DB);
    const user = await users.findById(userId);
    // Invited users now start with a random temporary password (never NULL),
    // so validity is gated purely by the signed token + its expiry — not by
    // password state, which would otherwise reject a legitimate accept.
    if (!user || user.disabledAt != null) throw new EdgeCMSError("unauthorized", "Invite is no longer valid");
    await users.setPassword(user.id, password);
    await createSession(c, c.env.SESSIONS, c.env.SESSION_SECRET, user.id);
    const csrfToken = issueCsrfCookie(c);
    return c.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, csrfToken }, 201);
  });

  // The SPA reads its own permission rules from here to hide actions the user
  // can't perform. The rules are the single source of truth shared with the
  // server-side `Ability`.
  app.get("/me", requireAuth(), async (c) => {
    const actor = c.var.actor;
    if (actor.type !== "user") throw new EdgeCMSError("forbidden", "Not a user session");
    const user = await new UsersStore(c.env.DB).findById(actor.id);
    if (!user) throw new EdgeCMSError("unauthorized", "Session user no longer exists");
    return c.json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
      ability: abilityForRole(user.role, rolesOf(c)).toJSON(),
    });
  });

  const keys = new Hono<AuthEnv>();
  keys.use("*", requireAuth(), requirePermission("manage", "api_keys"));

  keys.get("/", async (c) => {
    const records = await new ApiKeysStore(c.env.DB).list();
    return c.json({ keys: records });
  });

  keys.post("/", async (c) => {
    const body = apiKeyCreateSchema.parse(await c.req.json());
    const grants: PermissionGrant[] = body.grants ?? grantsFromScopes(body.scopes!, body.collections);
    const { record, rawKey } = await new ApiKeysStore(c.env.DB).create({
      name: body.name,
      grants,
      expiresAt: body.expiresAt ?? null,
    });
    await new AuditLog(c.env.DB).record({
      actor: c.var.actor,
      action: "api_key.create",
      subject: "api_keys",
      targetId: record.id,
      detail: { name: record.name, grants },
    });
    // rawKey is only ever returned here; only its hash is persisted.
    return c.json({ key: record, rawKey }, 201);
  });

  keys.post("/:id/revoke", async (c) => {
    const id = c.req.param("id");
    await new ApiKeysStore(c.env.DB).revoke(id);
    await new AuditLog(c.env.DB).record({ actor: c.var.actor, action: "api_key.revoke", subject: "api_keys", targetId: id });
    return c.body(null, 204);
  });

  keys.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await new ApiKeysStore(c.env.DB).delete(id);
    await new AuditLog(c.env.DB).record({ actor: c.var.actor, action: "api_key.delete", subject: "api_keys", targetId: id });
    return c.body(null, 204);
  });

  app.route("/api-keys", keys);

  // Read-only audit trail of management actions. Gated on settings management
  // (admins by default).
  app.get("/audit", requireAuth(), requirePermission("manage", "settings"), async (c) => {
    const limit = Number(c.req.query("limit") ?? "100");
    const entries = await new AuditLog(c.env.DB).list(Number.isFinite(limit) ? limit : 100);
    return c.json({ entries });
  });

  return app;
}
