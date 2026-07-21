/**
 * The AI capability seam. Runtime provides a Workers-AI-backed implementation;
 * tests inject a mock. Kept in core (not runtime) so the interface is a shared
 * contract and Workers-AI's weak local simulation never leaks into unit tests.
 */
export interface AIProvider {
  /** Generate descriptive alt text for an image given its raw bytes. */
  altText(image: ArrayBuffer): Promise<string>;
  /** Rewrite/improve a block of text, optionally steered by an instruction. */
  improve(text: string, instruction?: string): Promise<string>;
  /** Condense a block of text into a short summary. */
  summarize(text: string): Promise<string>;
  /** Derive SEO metadata (title + meta description) from a block of text. */
  seo(text: string): Promise<{ title: string; description: string }>;
  /** Translate text into the target locale. */
  translate(text: string, targetLocale: string, sourceLocale?: string): Promise<string>;
  /**
   * Embed one or more texts into vectors for semantic search. Returns one
   * vector per input, in order. All vectors from a given provider share a
   * fixed dimensionality (the Vectorize index must match it).
   */
  embed(texts: string[]): Promise<number[][]>;
}
