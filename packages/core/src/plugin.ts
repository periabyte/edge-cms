/**
 * The plugin lifecycle. Plugins carry functions, so unlike the serializable
 * config they're registered at runtime (passed to `createApp`). A plugin hooks
 * the document lifecycle to validate, enrich, or react to writes, and can
 * contribute custom field types the admin/validation layer understands.
 */
export type HookOperation = "create" | "update" | "delete";

export interface HookContext {
  collection: string;
  operation: HookOperation;
  /**
   * beforeChange: the incoming write data (mutable via the return value).
   * after* hooks: the persisted document (read-only).
   */
  data: Record<string, unknown>;
  actor: { type: string; id: string | null } | null;
}

export interface Plugin {
  name: string;
  /**
   * Contribute custom field types. Each maps a type name to a validator that
   * runs in the write path; the value it returns is what gets stored.
   */
  fieldTypes?: Record<string, (value: unknown) => unknown>;
  hooks?: {
    /** Runs before a create/update; return the (possibly transformed) data. */
    beforeChange?: (ctx: HookContext) => Record<string, unknown> | Promise<Record<string, unknown>>;
    /** Runs after any successful create/update. */
    afterChange?: (ctx: HookContext) => void | Promise<void>;
    /** Runs after a write that leaves the document published. */
    afterPublish?: (ctx: HookContext) => void | Promise<void>;
    /** Runs after a successful delete. */
    afterDelete?: (ctx: HookContext) => void | Promise<void>;
  };
}

/**
 * Runs registered plugins in order. `beforeChange` threads the data through
 * each plugin (later plugins see earlier transforms); the after-hooks are
 * side-effecting and awaited so failures surface to the caller, which decides
 * whether to run them inline or fire-and-forget.
 */
export class PluginHost {
  constructor(private readonly plugins: Plugin[] = []) {}

  get all(): readonly Plugin[] {
    return this.plugins;
  }

  /** Merge of every plugin's custom field-type validators. */
  fieldTypes(): Record<string, (value: unknown) => unknown> {
    const out: Record<string, (value: unknown) => unknown> = {};
    for (const p of this.plugins) Object.assign(out, p.fieldTypes ?? {});
    return out;
  }

  async beforeChange(ctx: HookContext): Promise<Record<string, unknown>> {
    let data = ctx.data;
    for (const p of this.plugins) {
      if (p.hooks?.beforeChange) data = await p.hooks.beforeChange({ ...ctx, data });
    }
    return data;
  }

  async afterChange(ctx: HookContext): Promise<void> {
    for (const p of this.plugins) await p.hooks?.afterChange?.(ctx);
  }

  async afterPublish(ctx: HookContext): Promise<void> {
    for (const p of this.plugins) await p.hooks?.afterPublish?.(ctx);
  }

  async afterDelete(ctx: HookContext): Promise<void> {
    for (const p of this.plugins) await p.hooks?.afterDelete?.(ctx);
  }
}
