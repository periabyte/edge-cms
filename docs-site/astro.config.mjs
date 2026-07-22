import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { ExpressiveCodeTheme } from "astro-expressive-code";
// @ts-ignore -- Vite raw-import query, not a real .jsonc export
import edgecmsDarkTheme from "./src/ec-themes/edgecms-dark.jsonc?raw";
// @ts-ignore -- Vite raw-import query, not a real .jsonc export
import edgecmsLightTheme from "./src/ec-themes/edgecms-light.jsonc?raw";

export default defineConfig({
  site: "https://edge.periabyte.dev",
  integrations: [
    starlight({
      title: "EdgeCMS",
      tagline: "Content with an edge.",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "EdgeCMS",
      },
      social: {
        github: "https://github.com/periabyte/edge-cms",
      },
      customCss: ["./src/styles/custom.css"],
      // Starlight's bundled code-block theme (Night Owl) has its own orange
      // tokens (#F78C6C / #ECC48D) that clash with the brand's signal-orange
      // — these are the same Night Owl themes with only the orange token
      // colors swapped to match (see src/ec-themes/).
      expressiveCode: {
        themes: [
          ExpressiveCodeTheme.fromJSONString(edgecmsDarkTheme),
          ExpressiveCodeTheme.fromJSONString(edgecmsLightTheme),
        ],
      },
      head: [
        {
          tag: "link",
          attrs: { rel: "icon", href: "/assets/logo.svg", type: "image/svg+xml" },
        },
      ],
      sidebar: [
        {
          label: "Guides",
          items: [
            { label: "Quickstart", slug: "guides/quickstart" },
            { label: "Schema & config", slug: "guides/schema-and-config" },
            { label: "Custom domains", slug: "guides/custom-domains" },
            { label: "Roles & access", slug: "guides/roles-and-access" },
            { label: "AI features", slug: "guides/ai-features" },
            { label: "Deployment", slug: "guides/deployment" },
          ],
        },
      ],
    }),
  ],
});
