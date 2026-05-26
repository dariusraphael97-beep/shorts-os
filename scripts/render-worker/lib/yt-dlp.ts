// scripts/render-worker/lib/yt-dlp.ts
//
// Thin wrapper around `yt-dlp-wrap`. The constructor is invoked lazily inside
// each function so the binary download (first-use only) cannot crash worker
// boot. yt-dlp-wrap caches the binary under node_modules/.bin after first use.
import YTDlpWrapDefault from 'yt-dlp-wrap';
import { join } from 'node:path';
import { mkdir, readFile, access, writeFile, chmod } from 'node:fs/promises';

type YTDlpWrapClass = typeof YTDlpWrapDefault;
type YTDlpWrapInstance = InstanceType<YTDlpWrapClass>;

// tsx/esbuild double-wraps this CJS package: `import x from 'yt-dlp-wrap'` resolves
// to `{ default: <class> }` instead of the class itself. Unwrap once if needed so
// `new YTDlpWrap(...)` resolves to the real class at runtime.
const YTDlpWrap: YTDlpWrapClass = (() => {
  const candidate = YTDlpWrapDefault as unknown as { default?: YTDlpWrapClass };
  if (typeof YTDlpWrapDefault === 'function') return YTDlpWrapDefault;
  if (candidate.default && typeof candidate.default === 'function') return candidate.default;
  throw new Error('yt-dlp-wrap: unrecognized module shape');
})();

// We download the pyinstaller standalone binary (yt-dlp_linux / yt-dlp_macos)
// rather than yt-dlp-wrap's default Python-zipapp asset. Vercel Sandbox is
// Amazon Linux 2023, which ships Python 3.9 — yt-dlp requires 3.10+, so the
// zipapp errors with "unsupported version of Python" before doing anything.
// The pyinstaller bundle has no system Python dependency.
function standaloneAssetUrl(): string {
  if (process.platform === 'darwin') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
  }
  if (process.arch === 'arm64') {
    return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64';
  }
  return 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
}

async function ensureBinary(binPath: string): Promise<void> {
  try {
    await access(binPath);
    return;
  } catch {
    // fall through to download
  }
  const url = standaloneAssetUrl();
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`yt-dlp download failed (${res.status}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(binPath, buf);
  await chmod(binPath, 0o755);
}

let cachedWrap: YTDlpWrapInstance | null = null;

async function getWrap(): Promise<YTDlpWrapInstance> {
  if (cachedWrap) return cachedWrap;
  const binDir = join(process.cwd(), 'node_modules', 'yt-dlp-wrap', 'bin');
  const binPath = join(binDir, 'yt-dlp');
  await mkdir(binDir, { recursive: true });
  await ensureBinary(binPath);
  cachedWrap = new YTDlpWrap(binPath);
  return cachedWrap;
}

// Reddit + YouTube refuse anonymous traffic from Vercel datacenter IPs. Operator
// supplies a base64-encoded Netscape cookies.txt as YTDLP_COOKIES_B64; we decode
// it once per worker boot to /tmp/cookies.txt and pass --cookies on every call.
const COOKIES_PATH = '/tmp/cookies.txt';
let cookiesReady: Promise<string | null> | null = null;

async function ensureCookiesFile(): Promise<string | null> {
  if (cookiesReady) return cookiesReady;
  cookiesReady = (async () => {
    const b64 = process.env.YTDLP_COOKIES_B64;
    if (!b64) return null;
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    await writeFile(COOKIES_PATH, decoded, { mode: 0o600 });
    return COOKIES_PATH;
  })();
  return cookiesReady;
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
  const cookiesPath = await ensureCookiesFile();
  const vttPath = args.outputPath.replace(/\.mp4$/, '') + '.en.vtt';

  const ytdlpArgs = [
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
  ];
  if (cookiesPath) ytdlpArgs.push('--cookies', cookiesPath);

  await wrap.execPromise(ytdlpArgs);

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
  cookiesReady = null;
}
