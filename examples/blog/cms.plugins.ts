import type { Plugin } from "edgecms";

/**
 * Project plugins — lifecycle hooks and custom field types. The generated
 * Worker entry imports this file's default export and passes it to `createApp`.
 * The `type`-only import above is erased at build time, so nothing here needs
 * to resolve `edgecms` at runtime.
 */
const plugins: Plugin[] = [
  {
    name: "color",
    fieldTypes: {
      // A hex-color validator wired into fields declared `field.custom("hex")`.
      // Runs in the write path; its return value is what gets stored.
      hex(value: unknown): string {
        const s = String(value ?? "").trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw new Error("expected a hex color like #1a2b3c");
        return s.toUpperCase();
      },
    },
  },
];

export default plugins;
