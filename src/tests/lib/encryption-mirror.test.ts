import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('encryption mirror', () => {
  it('scripts/render-worker/lib/encryption.ts matches src/lib/encryption.ts byte-for-byte', () => {
    const root = process.cwd();
    const src = readFileSync(resolve(root, 'src/lib/encryption.ts'));
    const mirror = readFileSync(resolve(root, 'scripts/render-worker/lib/encryption.ts'));
    expect(mirror.equals(src)).toBe(true);
  });
});
