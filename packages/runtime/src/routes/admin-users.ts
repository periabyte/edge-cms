import { Hono } from "hono";
import { z } from "zod";
import { EdgeCMSError, type EmailProvider } from "@edgecms/core";
import type { ResolvedConfig } from "@edgecms/config";
import { requireAuth, requirePermission, type AuthEnv } from "../auth/middleware.js";
import { csrfProtection } from "../auth/csrf.js";
import { UsersStore, toPublicUser } from "../auth/users-store.js";
import { AuditLog } from "../auth/audit-log.js";
import { createInviteToken } from "../auth/invite-token.js";
import { randomPassword } from "../auth/password.js";
import { inviteEmail } from "../email/templates.js";

/** Env for this group — adds the optional email provider set app-wide in app.ts. */
type UsersEnv = AuthEnv & { Variables: { email?: EmailProvider } };

const createSchema = z.object({
  email: z.string().email(),
  role: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  /** Omit to send an email invite (the user sets their own password). */
  password: z.string().min(8).optional(),
});
const updateSchema = z
  .object({ role: z.string().min(1), disabled: z.boolean(), name: z.string().trim().min(1).nullable() })
  .partial()
  .refine((b) => b.role !== undefined || b.disabled !== undefined || b.name !== undefined, {
    message: "Nothing to update",
  });
const passwordSchema = z.object({ password: z.string().min(8) });

/**
 * Admin-only user management under /admin/api/users. Guards against locking the
 * project out by deleting, disabling, or demoting the last active superuser.
 */
export function adminUserRoutes(config: ResolvedConfig) {
  const app = new Hono<UsersEnv>();
  app.use("*", requireAuth(), csrfProtection, requirePermission("manage", "users"));

  const roleNames = Object.keys(config.roles);
  const superuserRoles = roleNames.filter((r) => config.roles[r]?.admin === true);
  const roleList = roleNames.map((name) => ({
    name,
    label: config.roles[name]?.label ?? name,
    admin: config.roles[name]?.admin === true,
  }));

  const assertKnownRole = (role: string) => {
    if (!roleNames.includes(role)) throw new EdgeCMSError("bad_request", `Unknown role "${role}"`);
  };

  /**
   * Reject a change that would leave zero active superusers. `excludingId` is
   * the user being changed — counted out so demoting/disabling *them* is caught.
   */
  const guardLastAdmin = async (users: UsersStore, target: { id: string; role: string; disabledAt: number | null }) => {
    const targetIsActiveAdmin = target.disabledAt == null && superuserRoles.includes(target.role);
    if (!targetIsActiveAdmin) return; // changing a non-admin never affects the count
    const activeAdmins = await users.countActiveByRoles(superuserRoles);
    if (activeAdmins <= 1)
      throw new EdgeCMSError("forbidden", "Cannot remove the last active administrator");
  };

  app.get("/", async (c) => {
    const users = (await new UsersStore(c.env.DB).list()).map(toPublicUser);
    return c.json({ users, roles: roleList });
  });

  app.post("/", async (c) => {
    const body = createSchema.parse(await c.req.json());
    assertKnownRole(body.role);
    const users = new UsersStore(c.env.DB);
    if (await users.findByEmail(body.email))
      throw new EdgeCMSError("conflict", `A user with email "${body.email}" already exists`);

    // Password given → create a loginable user directly (as before).
    if (body.password) {
      const user = await users.create(body.email, body.password, body.role, body.name);
      await new AuditLog(c.env.DB).record({
        actor: c.var.actor,
        action: "user.create",
        subject: "users",
        targetId: user.id,
        detail: { email: user.email, role: user.role },
      });
      return c.json({ user: toPublicUser(user) }, 201);
    }

    // No password → invite: create the user with a random temporary password
    // (so the account is always loginable) and issue a signed accept link that
    // lets them set their own. Email both if a provider is configured; always
    // return them so the admin can copy them when email is unavailable.
    const temporaryPassword = randomPassword();
    const user = await users.create(body.email, temporaryPassword, body.role, body.name);
    const token = await createInviteToken(user.id, c.env.SESSION_SECRET);
    const base = config.email.baseUrl ?? new URL(c.req.url).origin;
    const inviteUrl = `${base}/admin/accept?token=${encodeURIComponent(token)}`;
    let emailed = false;
    if (c.var.email) {
      try {
        await c.var.email.send(
          inviteEmail({ to: user.email, url: inviteUrl, projectName: config.name, temporaryPassword }),
        );
        emailed = true;
      } catch {
        emailed = false; // fall back to the copyable link + password
      }
    }
    await new AuditLog(c.env.DB).record({
      actor: c.var.actor,
      action: "user.invite",
      subject: "users",
      targetId: user.id,
      detail: { email: user.email, role: user.role, emailed },
    });
    return c.json({ user: toPublicUser(user), inviteUrl, temporaryPassword, emailed }, 201);
  });

  app.patch("/:id", async (c) => {
    const body = updateSchema.parse(await c.req.json());
    const users = new UsersStore(c.env.DB);
    const user = await users.findById(c.req.param("id"));
    if (!user) throw new EdgeCMSError("not_found", "User not found");
    if (body.role !== undefined) assertKnownRole(body.role);

    // Demotion (admin → non-admin) or disabling could remove the last admin.
    const demoting = body.role !== undefined && superuserRoles.includes(user.role) && !superuserRoles.includes(body.role);
    const disabling = body.disabled === true;
    if (demoting || disabling) await guardLastAdmin(users, user);

    if (body.role !== undefined) await users.setRole(user.id, body.role);
    if (body.disabled !== undefined) await users.setDisabled(user.id, body.disabled);
    if (body.name !== undefined) await users.setName(user.id, body.name);
    await new AuditLog(c.env.DB).record({
      actor: c.var.actor,
      action: "user.update",
      subject: "users",
      targetId: user.id,
      detail: {
        ...(body.role !== undefined && { role: body.role }),
        ...(body.disabled !== undefined && { disabled: body.disabled }),
        ...(body.name !== undefined && { name: body.name }),
      },
    });
    const updated = await users.findById(user.id);
    return c.json({ user: toPublicUser(updated!) });
  });

  app.post("/:id/password", async (c) => {
    const body = passwordSchema.parse(await c.req.json());
    const users = new UsersStore(c.env.DB);
    const user = await users.findById(c.req.param("id"));
    if (!user) throw new EdgeCMSError("not_found", "User not found");
    await users.setPassword(user.id, body.password);
    return c.body(null, 204);
  });

  app.delete("/:id", async (c) => {
    const users = new UsersStore(c.env.DB);
    const user = await users.findById(c.req.param("id"));
    if (!user) return c.body(null, 204);
    await guardLastAdmin(users, user);
    await users.delete(user.id);
    await new AuditLog(c.env.DB).record({
      actor: c.var.actor,
      action: "user.delete",
      subject: "users",
      targetId: user.id,
      detail: { email: user.email },
    });
    return c.body(null, 204);
  });

  return app;
}
