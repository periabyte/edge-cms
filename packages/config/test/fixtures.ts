import { collection, defineConfig, field } from "../src/index.js";

/** The design doc's example config — blog with posts, authors, tags. */
export function blogConfig() {
  return defineConfig({
    name: "my-site",
    database: { adapter: "d1" },
    storage: { adapter: "r2" },
    ai: { enabled: true, features: ["alt-text", "semantic-search", "translate"] },
    auth: { providers: ["email"] },
    collections: [
      collection("posts", {
        fields: {
          title: field.text({ required: true }),
          slug: field.slug({ from: "title", unique: true }),
          body: field.richText(),
          cover: field.media(),
          author: field.relation("authors"),
          tags: field.relation("tags", { many: true }),
          status: field.select(["draft", "published"], { default: "draft" }),
        },
        versioning: true,
        localization: ["en", "de"],
        hooks: { afterPublish: ["revalidate-frontend"] },
      }),
      collection("authors", {
        fields: { name: field.text(), avatar: field.media() },
      }),
      collection("tags", {
        fields: { name: field.text({ required: true, unique: true }) },
      }),
    ],
  });
}
