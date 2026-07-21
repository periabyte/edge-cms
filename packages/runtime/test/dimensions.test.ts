import { describe, expect, it } from "vitest";
import { imageDimensions } from "../src/media/dimensions.js";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

describe("imageDimensions", () => {
  it("reads PNG dimensions from the IHDR chunk", () => {
    // 1×1 PNG
    const png = b64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
    expect(imageDimensions(png)).toEqual({ width: 1, height: 1 });
  });

  it("reads GIF dimensions from the logical screen descriptor", () => {
    // 2×2 GIF header (GIF89a, LE 0x0002 x 0x0002)
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x02, 0x00, 0x02, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageDimensions(gif.buffer)).toEqual({ width: 2, height: 2 });
  });

  it("returns null for unknown/too-short data", () => {
    expect(imageDimensions(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
    expect(imageDimensions(new Uint8Array(30).buffer)).toBeNull();
  });
});
