import type { CollectionDef, EdgeCMSConfig } from "./types.js";

export function defineConfig(config: EdgeCMSConfig): EdgeCMSConfig {
  return config;
}

export function collection(name: string, def: Omit<CollectionDef, "name">): CollectionDef {
  return { name, ...def };
}
