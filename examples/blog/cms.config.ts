import { collection, defineConfig, field } from "kalayaan";

export default defineConfig({
	name: "blog-example",
	database: { adapter: "d1" },
	storage: { adapter: "r2" },
	auth: { providers: ["email"] },
	ai: {
		enabled: true,
		features: ["alt-text", "editorial-assist", "translate"],
	},
	collections: [
		collection("posts", {
			fields: {
				title: field.text({ required: true }),
				slug: field.slug({ from: "title", unique: true }),
				body: field.richText({ aiEnrich: { action: "improve" } }),
				excerpt: field.text({
					aiEnrich: { action: "summarize", dependency: "body" },
				}),
				cover: field.media(),
				author: field.relation("authors"),
				tags: field.relation("tags", { many: true }),
				status: field.select(["draft", "published"], { default: "draft" }),
				// Plugin-contributed custom field type — validated by cms.plugins.ts.
				brand_color: field.custom("hex", {
					label: "Brand color",
					control: "text",
				}),
			},
			versioning: true,
			localization: ["en", "de"],
		}),
		collection("authors", {
			fields: { name: field.text({ required: true }), avatar: field.media() },
		}),
		collection("tags", {
			fields: { name: field.text({ required: true, unique: true }) },
		}),
	],
});
