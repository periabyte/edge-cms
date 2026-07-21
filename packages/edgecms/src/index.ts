// The umbrella package: `npm install edgecms` pulls in config, runtime, and
// the CLI in one shot, so `npx edgecms init` works from a single install.
//
// The generated Worker entry (see @edgecms/cli's entry-template.ts) imports
// resolveConfig/snapshotOf/createApp from HERE, not from @edgecms/config or
// @edgecms/runtime directly — a project only ever declares "edgecms" as a
// dependency, and package managers with strict, non-hoisted resolution
// (pnpm workspaces in particular) won't resolve a bare import of a
// transitive dependency that isn't re-exported through something the
// project actually depends on.
export { defineConfig, collection, field, resolveConfig, snapshotOf } from "@edgecms/config";
export type * from "@edgecms/config";
export { createApp } from "@edgecms/runtime";
// Runtime extension points: plugin lifecycle hooks and custom field types are
// registered via createApp's options — re-exported so a project depending only
// on "edgecms" can author them.
export { PluginHost } from "@edgecms/core";
export type { Plugin, HookContext, HookOperation, AIProvider, EmailProvider, EmailMessage } from "@edgecms/core";
