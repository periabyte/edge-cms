import { z } from "zod";
import { configSchema } from "./resolve.js";

/**
 * JSON Schema for cms.config.json, so non-TypeScript users get the same
 * validation and editor completion as defineConfig callers.
 */
export function configJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(configSchema, { target: "draft-7" }) as Record<string, unknown>;
}
