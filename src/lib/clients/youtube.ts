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
    throw new Error(`YouTube videos failed: ${videosRes.status}`);
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
