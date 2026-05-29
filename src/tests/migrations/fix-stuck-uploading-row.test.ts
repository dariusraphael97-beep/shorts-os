// Sanity test for the data migration shape. Does NOT hit prod;
// just verifies the SQL semantics for the controller's pre-apply review.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('20260528000009_fix_stuck_uploading_row.sql', () => {
  const sql = readFileSync(
    resolve('supabase/migrations/20260528000009_fix_stuck_uploading_row.sql'),
    'utf-8',
  );

  it('targets the known stuck row id', () => {
    expect(sql).toContain('11c221e0-693a-4e4c-a096-24725c4e327b');
  });

  it('is idempotent (guards on status = uploading)', () => {
    expect(sql.toLowerCase()).toMatch(/where[\s\S]+status\s*=\s*'uploading'/);
  });

  it('flips status to rendered + nulls scheduled_for', () => {
    expect(sql.toLowerCase()).toMatch(/set[\s\S]+status\s*=\s*'rendered'/);
    expect(sql.toLowerCase()).toMatch(/scheduled_for\s*=\s*null/);
  });

  it('updates updated_at to now()', () => {
    expect(sql.toLowerCase()).toMatch(/updated_at\s*=\s*now\(\)/);
  });

  it('also marks the related render_jobs row as failed', () => {
    expect(sql.toLowerCase()).toContain('render_jobs');
    expect(sql.toLowerCase()).toMatch(/status\s*=\s*'failed'/);
  });
});
