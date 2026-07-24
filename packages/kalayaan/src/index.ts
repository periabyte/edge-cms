// The umbrella package: `npm install kalayaan` pulls in config, runtime, and
// the CLI in one shot, so `npx kalayaan init` works from a single install.
//
// The generated Worker entry (see @kalayaan/cli's entry-template.ts) imports
// resolveConfig/snapshotOf/createApp from HERE, not from @kalayaan/config or
// @kalayaan/runtime directly — a project only ever declares "kalayaan" as a
// dependency, and package managers with strict, non-hoisted resolution
// (pnpm workspaces in particular) won't resolve a bare import of a
// transitive dependency that isn't re-exported through something the
// project actually depends on.
export { defineConfig, collection, field, resolveConfig, snapshotOf } from "@kalayaan/config";
export type * from "@kalayaan/config";
export { createApp } from "@kalayaan/runtime";
// Runtime extension points: plugin lifecycle hooks and custom field types are
// registered via createApp's options — re-exported so a project depending only
// on "kalayaan" can author them.
export { PluginHost } from "@kalayaan/core";
export type { Plugin, HookContext, HookOperation, AIProvider, EmailProvider, EmailMessage } from "@kalayaan/core";
