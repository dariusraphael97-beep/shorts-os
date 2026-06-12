export type YouTubeShortResult = {
  externalId: string;
  title: string;
  channelId: string;
  channelName: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  url: string;
  rawPayload: unknown;
};

export function parseISODurationToSeconds(iso: string): number {
  // PT#H#M#S
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const h = parseInt(match[1] ?? "0", 10);
  const m = parseInt(match[2] ?? "0", 10);
  const s = parseInt(match[3] ?? "0", 10);
  return h * 3600 + m * 60 + s;
}

export type SearchShortsParams = {
  query: string;
  apiKey: string;
  maxResults?: number;
};

/**
 * Search YouTube Shorts by query, returning normalized results.
 * Two API calls: search.list (for IDs) + videos.list (for stats + duration).
 */
export async function searchShortsByQuery(
  params: SearchShortsParams,
): Promise<YouTubeShortResult[]> {
  const { query, apiKey, maxResults = 25 } = params;

  // Step 1: search for video IDs
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoDuration", "short");
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    throw new Error(
      `YouTube search failed: ${searchRes.status} ${await searchRes.text()}`,
    );
  }
  const searchJson = (await searchRes.json()) as {
    items: Array<{ id: { videoId: string } }>;
  };
  const ids =
    searchJson.items?.map((i) => i.id.videoId).filter(Boolean) ?? [];
  if (ids.length === 0) return [];

  // Step 2: fetch stats + duration
  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("part", "snippet,statistics,contentDetails");
  videosUrl.searchParams.set("id", ids.join(","));
  videosUrl.searchParams.set("key", apiKey);

  const videosRes = await fetch(videosUrl.toString());
  if (!videosRes.ok) {
    throw new Error(
      `YouTube videos failed: ${videosRes.status} ${await videosRes.text()}`,
    );
  }
  const videosJson = (await videosRes.json()) as {
    items: Array<{
      id: string;
      snippet: {
        title: string;
        channelId: string;
        channelTitle: string;
        publishedAt: string;
      };
      statistics: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
      contentDetails: { duration: string };
    }>;
  };

  return videosJson.items.map((item) => ({
    externalId: item.id,
    title: item.snippet.title,
    channelId: item.snippet.channelId,
    channelName: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    views: parseInt(item.statistics.viewCount ?? "0", 10),
    likes: parseInt(item.statistics.likeCount ?? "0", 10),
    comments: parseInt(item.statistics.commentCount ?? "0", 10),
    durationSeconds: parseISODurationToSeconds(item.contentDetails.duration),
    url: `https://www.youtube.com/shorts/${item.id}`,
    rawPayload: item,
  }));
}

// ---------------------------------------------------------------------------
// Extended videos.list helpers
// ---------------------------------------------------------------------------

export const YOUTUBE_QUOTA_COST = {
  search: 100,
  videosList: 1,
  channelsList: 1,
  playlistItems: 1,
} as const;

export type YouTubeVideoDetail = {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  thumbnailUrl: string | null;
};

type RawVideoItem = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    tags?: string[];
    thumbnails?: { medium?: { url?: string }; high?: { url?: string }; default?: { url?: string } };
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

function mapVideoItem(item: RawVideoItem): YouTubeVideoDetail {
  const s = item.snippet ?? {};
  const stats = item.statistics ?? {};
  const thumb = s.thumbnails?.medium?.url ?? s.thumbnails?.high?.url ?? s.thumbnails?.default?.url ?? null;
  return {
    videoId: item.id,
    title: s.title ?? '',
    description: s.description ?? '',
    tags: s.tags ?? [],
    channelId: s.channelId ?? '',
    channelTitle: s.channelTitle ?? '',
    publishedAt: s.publishedAt ?? '',
    views: parseInt(stats.viewCount ?? '0', 10),
    likes: parseInt(stats.likeCount ?? '0', 10),
    comments: parseInt(stats.commentCount ?? '0', 10),
    durationSeconds: parseISODurationToSeconds(item.contentDetails?.duration ?? 'PT0S'),
    thumbnailUrl: thumb,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchVideosByIds(params: {
  apiKey: string;
  videoIds: string[];
}): Promise<YouTubeVideoDetail[]> {
  const { apiKey, videoIds } = params;
  if (videoIds.length === 0) return [];
  const results: YouTubeVideoDetail[] = [];
  for (const batch of chunk(videoIds, 50)) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,statistics,contentDetails');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube videos.list failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { items?: RawVideoItem[] };
    for (const item of json.items ?? []) results.push(mapVideoItem(item));
  }
  return results;
}

export async function searchVideoIds(params: {
  query: string; apiKey: string;
  videoDuration?: 'short' | 'medium' | 'long' | 'any';
  order?: 'viewCount' | 'relevance' | 'date';
  publishedAfter?: string; regionCode?: string; relevanceLanguage?: string; maxResults?: number;
}): Promise<string[]> {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.searchParams.set('part', 'id');
  u.searchParams.set('type', 'video');
  u.searchParams.set('q', params.query);
  u.searchParams.set('videoDuration', params.videoDuration ?? 'medium');
  u.searchParams.set('order', params.order ?? 'viewCount');
  if (params.publishedAfter) u.searchParams.set('publishedAfter', params.publishedAfter);
  u.searchParams.set('regionCode', params.regionCode ?? 'US');
  u.searchParams.set('relevanceLanguage', params.relevanceLanguage ?? 'en');
  u.searchParams.set('maxResults', String(params.maxResults ?? 50));
  u.searchParams.set('key', params.apiKey);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`searchVideoIds: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { items?: Array<{ id?: { videoId?: string } }> };
  return (json.items ?? []).map((i) => i.id?.videoId).filter((v): v is string => !!v);
}

export async function fetchMostPopularByCategory(params: {
  apiKey: string;
  categoryId: string;
  regionCode?: string;
  maxResults?: number;
}): Promise<YouTubeVideoDetail[]> {
  const { apiKey, categoryId, regionCode = 'US', maxResults = 50 } = params;
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,statistics,contentDetails');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('videoCategoryId', categoryId);
  url.searchParams.set('regionCode', regionCode);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`YouTube mostPopular failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { items?: RawVideoItem[] };
  return (json.items ?? []).map(mapVideoItem);
}

// ---------------------------------------------------------------------------
// Channel helpers
// ---------------------------------------------------------------------------

export type YouTubeChannel = {
  channelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  uploadsPlaylistId: string | null;
  publishedAt: string | null;
};

type RawChannelItem = {
  id: string;
  snippet?: { title?: string; customUrl?: string; publishedAt?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } };
  statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

function mapChannelItem(item: RawChannelItem): YouTubeChannel {
  const s = item.snippet ?? {};
  const stats = item.statistics ?? {};
  return {
    channelId: item.id,
    title: s.title ?? '',
    handle: s.customUrl ?? null,
    thumbnailUrl: s.thumbnails?.default?.url ?? s.thumbnails?.medium?.url ?? null,
    subscriberCount: parseInt(stats.subscriberCount ?? '0', 10),
    videoCount: parseInt(stats.videoCount ?? '0', 10),
    viewCount: parseInt(stats.viewCount ?? '0', 10),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
    publishedAt: s.publishedAt ?? null,
  };
}

export async function fetchChannels(params: {
  apiKey: string;
  channelIds: string[];
}): Promise<YouTubeChannel[]> {
  const { apiKey, channelIds } = params;
  if (channelIds.length === 0) return [];
  const results: YouTubeChannel[] = [];
  for (const batch of chunk(channelIds, 50)) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet,statistics,contentDetails');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube channels.list failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { items?: RawChannelItem[] };
    for (const item of json.items ?? []) results.push(mapChannelItem(item));
  }
  return results;
}

export async function fetchPlaylistItems(params: {
  apiKey: string;
  playlistId: string;
  maxResults?: number;
}): Promise<Array<{ videoId: string; publishedAt: string }>> {
  const { apiKey, playlistId, maxResults = 50 } = params;
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`YouTube playlistItems.list failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { items?: Array<{ contentDetails?: { videoId?: string; videoPublishedAt?: string } }> };
  return (json.items ?? [])
    .map((i) => ({ videoId: i.contentDetails?.videoId ?? '', publishedAt: i.contentDetails?.videoPublishedAt ?? '' }))
    .filter((i) => i.videoId);
}

function parseChannelIdFromUrl(input: string): string | null {
  const m = input.match(/\/channel\/(UC[\w-]+)/);
  if (m) return m[1];
  if (/^UC[\w-]{20,}$/.test(input.trim())) return input.trim();
  return null;
}

function parseHandle(input: string): string | null {
  const m = input.match(/(?:youtube\.com\/)?@([\w.-]+)/);
  if (m) return `@${m[1]}`;
  if (input.trim().startsWith('@')) return input.trim();
  return null;
}

export async function resolveChannel(params: {
  apiKey: string;
  urlOrHandle: string;
}): Promise<YouTubeChannel | null> {
  const { apiKey, urlOrHandle } = params;
  const id = parseChannelIdFromUrl(urlOrHandle);
  if (id) {
    const channels = await fetchChannels({ apiKey, channelIds: [id] });
    return channels[0] ?? null;
  }
  const handle = parseHandle(urlOrHandle);
  if (handle) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet,statistics,contentDetails');
    url.searchParams.set('forHandle', handle);
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube channels.forHandle failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { items?: RawChannelItem[] };
    const item = json.items?.[0];
    return item ? mapChannelItem(item) : null;
  }
  return null;
}
