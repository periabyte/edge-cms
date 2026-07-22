import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

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
