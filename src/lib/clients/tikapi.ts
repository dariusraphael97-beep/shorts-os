export type TikTokVideo = {
  externalId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  musicTitle?: string;
  url: string;
  rawPayload: unknown;
};

type TikApiItem = {
  id?: string;
  desc?: string;
  createTime?: number;
  stats?: { playCount?: number; diggCount?: number; commentCount?: number };
  music?: { title?: string };
  video?: { duration?: number };
  author?: { uniqueId?: string; id?: string };
};

type TikApiHashtagLookup = {
  challengeInfo?: { challenge?: { id?: string } };
};

type TikApiHashtagFeed = { itemList?: TikApiItem[] };

/**
 * TikAPI's `/public/hashtag` endpoint is a two-call flow:
 *   1. `?name=<hashtag>` → returns the hashtag's numeric `challenge.id`.
 *   2. `?id=<challenge_id>&count=<n>` → returns the video `itemList`.
 *
 * Using `?hashtag=` returns 403 "Either hashtag ID or name is required",
 * and `?name=` without an id can't take `count`/`cursor`. So we always
 * make both calls.
 */
export async function searchTrendingByHashtag(params: {
  hashtag: string;
  apiKey: string;
  count?: number;
}): Promise<TikTokVideo[]> {
  const count = params.count ?? 30;
  const headers = { "X-API-KEY": params.apiKey };

  // Step 1: resolve hashtag name → challenge id
  const lookupUrl = `https://api.tikapi.io/public/hashtag?name=${encodeURIComponent(
    params.hashtag,
  )}`;
  const lookupRes = await fetch(lookupUrl, { headers });
  if (!lookupRes.ok) {
    throw new Error(
      `TikAPI hashtag lookup failed: ${lookupRes.status} ${await lookupRes.text()}`,
    );
  }
  const lookupJson = (await lookupRes.json()) as TikApiHashtagLookup;
  const challengeId = lookupJson.challengeInfo?.challenge?.id;
  if (!challengeId) return [];

  // Step 2: fetch trending videos for that challenge id
  const feedUrl = `https://api.tikapi.io/public/hashtag?id=${encodeURIComponent(
    challengeId,
  )}&count=${count}`;
  const feedRes = await fetch(feedUrl, { headers });
  if (!feedRes.ok) {
    throw new Error(
      `TikAPI hashtag feed failed: ${feedRes.status} ${await feedRes.text()}`,
    );
  }
  const j = (await feedRes.json()) as TikApiHashtagFeed;
  return (j.itemList ?? []).map((it) => ({
    externalId: it.id ?? "",
    title: it.desc ?? "",
    channelName: it.author?.uniqueId ?? "",
    channelId: it.author?.id ?? "",
    publishedAt: new Date((it.createTime ?? 0) * 1000).toISOString(),
    views: it.stats?.playCount ?? 0,
    likes: it.stats?.diggCount ?? 0,
    comments: it.stats?.commentCount ?? 0,
    durationSeconds: it.video?.duration ?? 0,
    musicTitle: it.music?.title,
    url: `https://www.tiktok.com/@${it.author?.uniqueId ?? ""}/video/${it.id ?? ""}`,
    rawPayload: it,
  }));
}
