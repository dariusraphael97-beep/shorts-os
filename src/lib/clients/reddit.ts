import { withRetry } from "@/lib/scrapers/shared";

/**
 * Typed wrapper around Reddit's public unauthenticated JSON endpoints.
 *
 * We deliberately do NOT use OAuth here. Reddit's read-only JSON feed
 * (`https://www.reddit.com/r/<sub>/top.json`) is free to call without
 * client credentials as long as we send a descriptive User-Agent.
 *
 * If `REDDIT_USER_AGENT` is set we use it; otherwise we fall back to a
 * polite default identifying this project.
 */

export type RedditPost = {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  /** Path only — caller may prepend `https://reddit.com`. */
  permalink: string;
  /** External link for link posts, or the reddit URL for self posts. */
  url: string;
  author: string;
  score: number;
  numComments: number;
  /** Seconds since epoch. */
  createdUtc: number;
  upvoteRatio: number;
  flair: string | null;
  isSelf: boolean;
  isVideo: boolean;
};

type RedditListing = {
  kind?: string;
  data?: {
    children?: Array<{
      kind?: string;
      data?: {
        id?: string;
        subreddit?: string;
        title?: string;
        selftext?: string;
        permalink?: string;
        url?: string;
        author?: string;
        score?: number;
        num_comments?: number;
        created_utc?: number;
        upvote_ratio?: number;
        over_18?: boolean;
        stickied?: boolean;
        is_self?: boolean;
        is_video?: boolean;
        link_flair_text?: string | null;
      };
    }>;
  };
};

const DEFAULT_USER_AGENT = "shorts-os/0.1 (+https://github.com/shorts-os)";

function userAgent(): string {
  return process.env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT;
}

export async function getTopPosts(
  subreddit: string,
  options?: {
    period?: "hour" | "day" | "week" | "month" | "year" | "all";
    limit?: number;
  },
): Promise<RedditPost[]> {
  const period = options?.period ?? "day";
  const limit = options?.limit ?? 25;
  const sub = encodeURIComponent(subreddit);
  const url = `https://www.reddit.com/r/${sub}/top.json?t=${period}&limit=${limit}`;

  const json = await withRetry(
    async () => {
      const res = await fetch(url, {
        headers: { "User-Agent": userAgent() },
      });
      if (!res.ok) {
        throw new Error(`Reddit ${res.status} for r/${subreddit}`);
      }
      return (await res.json()) as RedditListing;
    },
    { attempts: 3, baseDelayMs: 1000 },
  );

  const children = json.data?.children ?? [];
  const posts: RedditPost[] = [];
  for (const child of children) {
    const d = child?.data;
    if (!d || !d.id || !d.title) continue;
    if (d.stickied) continue;
    if (d.over_18) continue;
    if (d.author === "[deleted]") continue;
    posts.push({
      id: d.id,
      subreddit: d.subreddit ?? subreddit,
      title: d.title,
      selftext: d.selftext ?? "",
      permalink: d.permalink ?? "",
      url: d.url ?? "",
      author: d.author ?? "",
      score: d.score ?? 0,
      numComments: d.num_comments ?? 0,
      createdUtc: d.created_utc ?? 0,
      upvoteRatio: d.upvote_ratio ?? 0,
      flair: d.link_flair_text ?? null,
      isSelf: Boolean(d.is_self),
      isVideo: Boolean(d.is_video),
    });
  }
  return posts;
}
