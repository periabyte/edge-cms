import type { RolesConfig } from "./types.js";

/**
 * Built-in roles used when a project declares no `roles` block. `admin` is a
 * superuser; `editor` gets full content + media authoring but no access to
 * users, API keys, webhooks, or settings; `viewer` is read-only. The runtime's
 * `Ability` treats the `"*"` subject as "all collections" (never a system
 * subject), so editor/viewer can't reach management areas by wildcard.
 */
export function defaultRoles(): RolesConfig {
  return {
    admin: { label: "Administrator", admin: true, permissions: [{ subjects: "*", actions: "*" }] },
    editor: {
      label: "Editor",
      permissions: [
        { subjects: "*", actions: ["read", "create", "update", "delete", "publish"] },
        { subjects: ["media"], actions: ["read", "create", "update", "delete"] },
        { subjects: ["ai"], actions: ["read"] },
      ],
    },
    viewer: {
      label: "Viewer",
      permissions: [
        { subjects: "*", actions: ["read"] },
        { subjects: ["media"], actions: ["read"] },
      ],
    },
    // The ability applied to unauthenticated requests. Default = read published
    // content on all collections (the historical public-API behavior). Grant
    // `create` on a collection to enable anonymous submissions there.
    public: {
      label: "Public",
      permissions: [{ subjects: "*", actions: ["read"] }],
    },
  };
}

/** The reserved superuser role name that must always exist and stay super. */
export const ADMIN_ROLE = "admin";

/** The reserved role name whose ability is applied to anonymous requests. */
export const PUBLIC_ROLE = "public";
