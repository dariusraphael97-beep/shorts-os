// scripts/render-worker/lib/glyph-hash.ts
//
// Loads a PNG (the font-probe frame) and computes deterministic md5 hashes
// over four glyph rectangles. Uses zlib + crypto only — no PNG-decode library
// dep. Assumes the PNG is ffmpeg/Remotion-generated with PNG filter type 0
// (none) on every scanline. If a future Remotion version emits non-trivial
// filters, this code will need full PNG filter handling.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflate } from 'node:zlib';
import { promisify } from 'node:util';

const inflateP = promisify(inflate);

export interface GlyphRect { name: string; x: number; y: number; w: number; h: number; }
export interface FontFingerprint { generated_at: string; rects: GlyphRect[]; hashes: Record<string, string>; }

interface PngDecoded { width: number; height: number; rgba: Buffer; }

async function decodePng(buf: Buffer): Promise<PngDecoded> {
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  let pos = 8;
  let width = 0, height = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.slice(pos, pos + 4).toString('ascii'); pos += 4;
    const data = buf.slice(pos, pos + len); pos += len;
    pos += 4; // skip CRC
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`unsupported PNG bit_depth=${bitDepth} color_type=${colorType}`);
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') break;
  }
  const compressed = Buffer.concat(idatChunks);
  const decompressed = await inflateP(compressed);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  // Assumes filter type 0 (none) on every row. Strip the leading filter byte.
  const out = Buffer.alloc(width * height * 4); // always return RGBA
  for (let y = 0; y < height; y++) {
    const srcRow = decompressed.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      out[di] = srcRow[si];
      out[di + 1] = srcRow[si + 1];
      out[di + 2] = srcRow[si + 2];
      out[di + 3] = channels === 4 ? srcRow[si + 3] : 255;
    }
  }
  return { width, height, rgba: out };
}

function hashRect(decoded: PngDecoded, rect: GlyphRect): string {
  const hash = createHash('md5');
  const stride = decoded.width * 4;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    const start = y * stride + rect.x * 4;
    hash.update(decoded.rgba.slice(start, start + rect.w * 4));
  }
  return hash.digest('hex');
}

export async function computeFingerprint(pngPath: string, rects: GlyphRect[]): Promise<Record<string, string>> {
  const buf = await readFile(pngPath);
  const decoded = await decodePng(buf);
  const hashes: Record<string, string> = {};
  for (const r of rects) hashes[r.name] = hashRect(decoded, r);
  return hashes;
}

export async function verifyFingerprint(pngPath: string, expected: FontFingerprint): Promise<{ ok: boolean; actual: Record<string, string>; mismatches: string[] }> {
  const actual = await computeFingerprint(pngPath, expected.rects);
  const mismatches: string[] = [];
  for (const r of expected.rects) {
    if (actual[r.name] !== expected.hashes[r.name]) mismatches.push(r.name);
  }
  return { ok: mismatches.length === 0, actual, mismatches };
}
