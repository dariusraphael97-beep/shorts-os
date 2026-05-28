// scripts/render-worker/lib/youtube-upload.ts
// Sandbox-side YouTube Data API v3 videos.insert with a resumable upload session.
// Single-shot upload: we hold the whole MP4 in memory (< 200 MB for Shorts) and PUT
// it in one go. Multi-chunk resume is overkill for our file sizes.

export class YouTubeUploadError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'YouTubeUploadError';
  }
}

export interface UploadArgs {
  accessToken: string;
  videoBytes: Uint8Array;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: 'private' | 'public' | 'unlisted';
  madeForKids: boolean;
  categoryId: string; // '24' = Entertainment, '22' = People & Blogs, etc.
}

export interface UploadResult {
  externalVideoId: string;
  url: string;
}

const INIT_ENDPOINT =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

// Node 24's fetch has no implicit timeout — a hung server pins the process for
// the Sandbox's lifetime. 90s per fetch is plenty for a Shorts-sized MP4.
const FETCH_TIMEOUT_MS = 90_000;

export async function uploadVideo(args: UploadArgs): Promise<UploadResult> {
  const metadata = {
    snippet: {
      title: args.title,
      description: args.description,
      tags: args.tags,
      categoryId: args.categoryId,
    },
    status: {
      privacyStatus: args.privacyStatus,
      madeForKids: args.madeForKids,
      selfDeclaredMadeForKids: args.madeForKids,
    },
  };

  // 1. Initiate session
  const initRes = await fetchWithTimeout(INIT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(args.videoBytes.byteLength),
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) {
    throw new YouTubeUploadError(`upload init: ${initRes.status} ${await initRes.text()}`, initRes.status);
  }
  const sessionUrl = initRes.headers.get('location');
  if (!sessionUrl) {
    throw new YouTubeUploadError('upload init: no Location header', initRes.status);
  }

  // 2. PUT bytes
  const putRes = await fetchWithTimeout(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(args.videoBytes.byteLength) },
    body: args.videoBytes as BodyInit,
  });
  if (!putRes.ok) {
    throw new YouTubeUploadError(`upload PUT: ${putRes.status} ${await putRes.text()}`, putRes.status);
  }
  const json = (await putRes.json()) as { id?: string };
  if (!json.id) {
    throw new YouTubeUploadError('upload response missing id', putRes.status);
  }
  return {
    externalVideoId: json.id,
    url: `https://www.youtube.com/shorts/${json.id}`,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new YouTubeUploadError(`fetch timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`, 0);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
