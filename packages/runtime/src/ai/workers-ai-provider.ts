import type { AIProvider } from "@edgecms/core";
import { DEFAULT_AI_MODELS, DEFAULT_EMBED_DIMENSIONS, type AIModelOverrides } from "@edgecms/config";

/** Workers AI model ids used by the provider when a config doesn't override them. */
export const AI_MODELS = DEFAULT_AI_MODELS;

/** Embedding dimensionality of the default embed model (bge-m3) — the Vectorize index must match. */
export const EMBED_DIMENSIONS = DEFAULT_EMBED_DIMENSIONS;

/** Minimal shape of the Workers AI binding we depend on. */
export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

/** AIProvider backed by the Cloudflare Workers AI binding (env.AI). */
export class WorkersAIProvider implements AIProvider {
  private readonly models: { text: string; vision: string; translate: string; embed: string };

  constructor(
    private readonly ai: AiBinding,
    modelOverrides: Pick<AIModelOverrides, "text" | "vision" | "translate" | "embed"> = {},
  ) {
    this.models = { ...AI_MODELS, ...modelOverrides };
  }

  async altText(image: ArrayBuffer): Promise<string> {
    const res = await this.ai.run(this.models.vision, {
      image: [...new Uint8Array(image)],
      prompt: "Describe this image in a single concise sentence suitable for alt text.",
      max_tokens: 128,
    });
    return readText(res).trim();
  }

  async improve(text: string, instruction?: string): Promise<string> {
    const res = await this.ai.run(this.models.text, {
      messages: [
        {
          role: "system",
          content:
            instruction ??
            "Improve the clarity, grammar, and flow of the user's text. Preserve its meaning and voice. Return only the revised text.",
        },
        { role: "user", content: text },
      ],
    });
    return readText(res).trim();
  }

  async summarize(text: string): Promise<string> {
    const res = await this.ai.run(this.models.text, {
      messages: [
        {
          role: "system",
          content:
            "Summarize the user's text in two or three sentences. Preserve the key points. Return only the summary.",
        },
        { role: "user", content: text },
      ],
    });
    return readText(res).trim();
  }

  async seo(text: string): Promise<{ title: string; description: string }> {
    const res = await this.ai.run(this.models.text, {
      messages: [
        {
          role: "system",
          content:
            'From the user\'s text, produce SEO metadata as strict JSON: {"title": "<=60 chars", "description": "<=155 chars"}. Return only the JSON object.',
        },
        { role: "user", content: text },
      ],
    });
    return parseSeo(readText(res));
  }

  async translate(text: string, targetLocale: string, sourceLocale?: string): Promise<string> {
    const res = await this.ai.run(this.models.translate, {
      text,
      source_lang: sourceLocale ?? "en",
      target_lang: targetLocale,
    });
    return readText(res).trim();
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.ai.run(this.models.embed, { text: texts });
    const data = (res as { data?: unknown }).data;
    if (!Array.isArray(data))
      throw new Error("Workers AI embedding returned no data array");
    return data as number[][];
  }
}

/**
 * Best-effort parse of the model's SEO JSON. Falls back to deriving a title
 * from the first line and using the raw text as the description when the model
 * doesn't return clean JSON.
 */
function parseSeo(raw: string): { title: string; description: string } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as { title?: unknown; description?: unknown };
      if (typeof obj.title === "string" && typeof obj.description === "string")
        return { title: obj.title.trim(), description: obj.description.trim() };
    } catch {
      // fall through to the heuristic below
    }
  }
  const firstLine = raw.split("\n").find((l) => l.trim()) ?? "";
  return { title: firstLine.trim().slice(0, 60), description: raw.trim().slice(0, 155) };
}

/** Normalizes the various shapes Workers AI models return into a string. */
function readText(res: unknown): string {
  if (typeof res === "string") return res;
  if (res && typeof res === "object") {
    const r = res as Record<string, unknown>;
    if (typeof r.response === "string") return r.response;
    if (typeof r.translated_text === "string") return r.translated_text;
    if (typeof r.description === "string") return r.description;
    if (typeof r.result === "string") return r.result;
  }
  return "";
}
