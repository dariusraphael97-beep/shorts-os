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

export async function searchTrendingByHashtag(params: {
  hashtag: string;
  apiKey: string;
  count?: number;
}): Promise<TikTokVideo[]> {
  const url = `https://api.tikapi.io/public/hashtag?hashtag=${encodeURIComponent(
    params.hashtag,
  )}&count=${params.count ?? 30}`;
  const res = await fetch(url, { headers: { "X-API-KEY": params.apiKey } });
  if (!res.ok) throw new Error(`TikAPI failed: ${res.status}`);
  const j = (await res.json()) as { itemList?: TikApiItem[] };
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
