/**
 * Best-effort image dimension extraction from the leading bytes of common
 * formats (PNG, JPEG, GIF, WebP). Returns null when the format is unknown or
 * the header is truncated — callers store nulls rather than failing an upload.
 * Kept dependency-free so it runs anywhere (no `sharp` in the request path).
 */
export function imageDimensions(bytes: ArrayBuffer): { width: number; height: number } | null {
  const view = new DataView(bytes);
  if (view.byteLength < 24) return null;

  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (view.getUint32(0) === 0x89504e47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF: "GIF8", then logical screen width/height as little-endian uint16.
  if (view.getUint32(0) === 0x47494638) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  // JPEG: scan segments for a Start-Of-Frame marker (0xFFC0–0xFFCF, excluding
  // 0xC4/0xC8/0xCC which aren't SOF), then read height/width (big-endian).
  if (view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) {
        offset++;
        continue;
      }
      const marker = view.getUint8(offset + 1);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      const segmentLength = view.getUint16(offset + 2);
      if (segmentLength <= 0) return null;
      offset += 2 + segmentLength;
    }
    return null;
  }

  // WebP: "RIFF"...."WEBP", then a VP8/VP8L/VP8X chunk.
  if (view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const fourcc = view.getUint32(12);
    // VP8X (extended): 24-bit little-endian (value-1) width/height at offset 24/27.
    if (fourcc === 0x56503858 && view.byteLength >= 30) {
      const w = 1 + (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16));
      const h = 1 + (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16));
      return { width: w, height: h };
    }
    // VP8 (lossy): 14-bit dimensions after the 3-byte start code at offset 26.
    if (fourcc === 0x56503820 && view.byteLength >= 30) {
      const w = view.getUint16(26, true) & 0x3fff;
      const h = view.getUint16(28, true) & 0x3fff;
      return { width: w, height: h };
    }
  }

  return null;
}
