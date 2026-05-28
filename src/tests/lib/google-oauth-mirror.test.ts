import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('google-oauth mirror', () => {
  it('worker mirror matches src after stripping the server-only import line', () => {
    const root = process.cwd();
    const src = readFileSync(resolve(root, 'src/lib/clients/google-oauth.ts'), 'utf8');
    const mirror = readFileSync(resolve(root, 'scripts/render-worker/lib/google-oauth.ts'), 'utf8');

    // Strip the first import-block in each: in src, the first non-blank line is `import 'server-only';`;
    // in the mirror, the first three lines are the explanatory comment. Compare the body after the first
    // blank line that follows the header.
    const tail = (text: string) => {
      const idx = text.indexOf('export ');
      if (idx < 0) throw new Error('no export found');
      return text.slice(idx);
    };
    expect(tail(mirror)).toBe(tail(src));
  });
});
