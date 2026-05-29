import 'server-only';
import type { AdapterResult } from '@/lib/ingestion/run';

/**
 * TikTok Creative Center is spec'd as a Chrome-MCP web scrape, which a Vercel
 * cron cannot drive. This adapter is intentionally DISABLED: it records a clean
 * `skipped` run so /admin/ingestion-health shows the source as idle-by-design,
 * not failing. Real ingest (operator-driven Chrome MCP, or a TOS-compliant data
 * path) slots in here later without changing the cron wiring.
 */
export async function runTikTokCreativeCenter(): Promise<AdapterResult> {
  return {
    ingested: 0,
    skipped: 0,
    quotaUnits: 0,
    status: 'skipped',
    context: { reason: 'tiktok_disabled_pending_chrome_mcp' },
  };
}
