import { describe, expect, it, vi } from "vitest";
import { AI_MODELS, WorkersAIProvider, type AiBinding } from "../src/ai/workers-ai-provider.js";

function fakeBinding(result: unknown): { ai: AiBinding; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async () => result);
  return { ai: { run }, run };
}

describe("WorkersAIProvider", () => {
  it("calls the vision model for alt text and normalizes the description field", async () => {
    const { ai, run } = fakeBinding({ description: "a cat" });
    const out = await new WorkersAIProvider(ai).altText(new Uint8Array([1, 2, 3]).buffer);
    expect(out).toBe("a cat");
    expect(run).toHaveBeenCalledWith(AI_MODELS.vision, expect.objectContaining({ prompt: expect.any(String), image: [1, 2, 3] }));
  });

  it("calls the text model with system+user messages for improve", async () => {
    const { ai, run } = fakeBinding({ response: "better" });
    const out = await new WorkersAIProvider(ai).improve("meh", "make it punchy");
    expect(out).toBe("better");
    const [model, inputs] = run.mock.calls[0]!;
    expect(model).toBe(AI_MODELS.text);
    const messages = (inputs as { messages: { role: string; content: string }[] }).messages;
    expect(messages[0]!.content).toBe("make it punchy");
    expect(messages[1]!.content).toBe("meh");
  });

  it("calls the text model for summarize", async () => {
    const { ai, run } = fakeBinding({ response: "short" });
    const out = await new WorkersAIProvider(ai).summarize("a long story");
    expect(out).toBe("short");
    const [model, inputs] = run.mock.calls[0]!;
    expect(model).toBe(AI_MODELS.text);
    const messages = (inputs as { messages: { content: string }[] }).messages;
    expect(messages[0]!.content).toMatch(/[Ss]ummar/);
    expect(messages[1]!.content).toBe("a long story");
  });

  it("parses SEO JSON returned by the text model", async () => {
    const { ai } = fakeBinding({ response: '{"title": "Widgets", "description": "All about widgets."}' });
    const out = await new WorkersAIProvider(ai).seo("content");
    expect(out).toEqual({ title: "Widgets", description: "All about widgets." });
  });

  it("falls back to a heuristic when SEO output is not clean JSON", async () => {
    const { ai } = fakeBinding({ response: "Just some prose, no JSON here." });
    const out = await new WorkersAIProvider(ai).seo("content");
    expect(out.title.length).toBeGreaterThan(0);
    expect(out.description.length).toBeGreaterThan(0);
  });

  it("calls the translation model with source/target langs", async () => {
    const { ai, run } = fakeBinding({ translated_text: "hola" });
    const out = await new WorkersAIProvider(ai).translate("hi", "es");
    expect(out).toBe("hola");
    expect(run).toHaveBeenCalledWith(AI_MODELS.translate, { text: "hi", source_lang: "en", target_lang: "es" });
  });

  it("uses a config-provided model override instead of the default, leaving others untouched", async () => {
    const { ai, run } = fakeBinding({ response: "better" });
    const provider = new WorkersAIProvider(ai, { text: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" });
    await provider.improve("meh");
    expect(run.mock.calls[0]![0]).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

    const { ai: ai2, run: run2 } = fakeBinding({ translated_text: "hola" });
    await new WorkersAIProvider(ai2, { text: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }).translate("hi", "es");
    expect(run2.mock.calls[0]![0]).toBe(AI_MODELS.translate);
  });
});
