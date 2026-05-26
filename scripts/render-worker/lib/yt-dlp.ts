// scripts/render-worker/lib/yt-dlp.ts
//
// Thin wrapper around `yt-dlp-wrap`. The constructor is invoked lazily inside
// each function so the binary download (first-use only) cannot crash worker
// boot. yt-dlp-wrap caches the binary under node_modules/.bin after first use.
import YTDlpWrap from 'yt-dlp-wrap';
import { join } from 'node:path';
import { readFile, access } from 'node:fs/promises';

let cachedWrap: YTDlpWrap | null = null;

async function getWrap(): Promise<YTDlpWrap> {
  if (cachedWrap) return cachedWrap;
  const binDir = join(process.cwd(), 'node_modules', 'yt-dlp-wrap', 'bin');
  const binPath = join(binDir, 'yt-dlp');
  try {
    await access(binPath);
  } catch {
    await YTDlpWrap.downloadFromGithub(binPath);
  }
  cachedWrap = new YTDlpWrap(binPath);
  return cachedWrap;
}

export interface YtDlpDownloadResult {
  videoPath: string;
  autoSubtitlesText: string | null;
}

export async function downloadVideoAndAutoSubs(args: {
  sourceUrl: string;
  outputPath: string;
}): Promise<YtDlpDownloadResult> {
  const wrap = await getWrap();
  const vttPath = args.outputPath.replace(/\.mp4$/, '') + '.en.vtt';

  await wrap.execPromise([
    args.sourceUrl,
    '--format', 'best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--write-auto-subs',
    '--sub-langs', 'en.*',
    '--sub-format', 'vtt',
    '--no-playlist',
    '--no-warnings',
    '--max-filesize', '200M',
    '--socket-timeout', '30',
    '-o', args.outputPath,
  ]);

  let autoSubtitlesText: string | null = null;
  try {
    const raw = await readFile(vttPath, 'utf8');
    autoSubtitlesText = vttToPlainText(raw);
    if (autoSubtitlesText.trim().length < 4) autoSubtitlesText = null;
  } catch {
    autoSubtitlesText = null;
  }

  return { videoPath: args.outputPath, autoSubtitlesText };
}

function vttToPlainText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('WEBVTT')) continue;
    if (/^\d+$/.test(line.trim())) continue;
    if (line.includes('-->')) continue;
    out.push(line.replace(/<[^>]+>/g, '').trim());
  }
  return out.join(' ');
}

export function _resetForTests() {
  cachedWrap = null;
}
