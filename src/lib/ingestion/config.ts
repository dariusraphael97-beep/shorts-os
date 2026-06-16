// Static ingestion defaults. Onboarding (§4.14) overrides these per-operator later.

export interface YouTubeCategory {
  id: string;
  label: string;
}

// YouTube Data API videoCategoryId values (regionCode=US).
export const YOUTUBE_CATEGORIES: YouTubeCategory[] = [
  { id: '23', label: 'Comedy' },
  { id: '24', label: 'Entertainment' },
  { id: '27', label: 'Education' },
  { id: '28', label: 'Science & Technology' },
  { id: '26', label: 'Howto & Style' },
  { id: '25', label: 'News & Politics' },
  { id: '20', label: 'Gaming' },
  { id: '17', label: 'Sports' },
  { id: '1', label: 'Film & Animation' },
  { id: '10', label: 'Music' },
  { id: '15', label: 'Pets & Animals' },
  { id: '22', label: 'People & Blogs' },
];

export const SHORTS_SEARCH_SEEDS: string[] = [
  'weird history facts',
  'satisfying restoration',
  'life hacks',
  'science explained',
  'true crime short',
  'money tips',
  'fitness transformation',
  'cooking hack',
  'tech review short',
  'psychology facts',
];

/**
 * Seed queries for the dominatable longform sweep. These are SPECIFIC entry points into
 * proven FACELESS (AI-producible) longform niches — not generic keywords. Generic seeds
 * ("how it works", "weird animals") return a topically-random viral grab-bag; specific
 * niche phrases land on real faceless explainer/doc channels, and the sweep then expands
 * outward via their channels. Mix = the model niches from the YT-automation playbook
 * (senior finance, geopolitics map explainers, 2nd-person history, space/ancient docs,
 * true crime, animated religion) plus our own lanes (everyday-assumption essays, cars).
 */
export const DOMINATABLE_SEEDS: readonly string[] = [
  'medicare explained for retirees',
  'social security benefits explained',
  'geopolitics explained map',
  'world war 2 explained animated',
  'ancient civilization documentary',
  'space exploration documentary',
  'what if you were born in ancient',
  'unsolved true crime explained',
  'how the economy actually works',
  'the dark history of',
  'why do we say',
  'animated bible stories',
  'cold case solved documentary',
  'famous battles explained',
  'psychology of human behavior explained',
  'deep sea creatures documentary',
];

/** A video qualifies as a dominatable candidate when ALL hold (mirrors seed-niches). */
export const DOMINATABLE_GATE = {
  minDurationSeconds: 240,
  minViews: 300_000,
  minViewsToSubsRatio: 3,
  maxChannelAgeDays: 365,
  publishedWithinDays: 120,
} as const;

export const REDDIT_SEED_SUBREDDITS: string[] = [
  'NewTubers', 'PartneredYoutube', 'youtubers', 'NextLevel', 'youtube',
  'Damnthatsinteresting', 'todayilearned', 'interestingasfuck', 'nextfuckinglevel',
  'BeAmazed', 'oddlysatisfying', 'educationalgifs', 'coolguides', 'lifehacks',
  'explainlikeimfive', 'YouShouldKnow', 'GetMotivated', 'productivity', 'Fitness',
  'personalfinance', 'cooking', 'gadgets', 'science', 'space', 'history',
  'Documentaries', 'TrueCrime', 'psychology', 'AskReddit', 'Showerthoughts',
];

export const GOOGLE_TRENDS_GEO = 'US';

/**
 * Deterministic daily slice of a seed list, so we cover all seeds across a
 * rotation without spending quota on every seed every day. The slice start
 * advances by `count` each UTC day and wraps around.
 */
export function rotatingSeedSlice<T>(seeds: T[], count: number, now: Date = new Date()): T[] {
  if (seeds.length === 0) return [];
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  const start = (dayIndex * count) % seeds.length;
  const out: T[] = [];
  for (let i = 0; i < Math.min(count, seeds.length); i++) {
    out.push(seeds[(start + i) % seeds.length]);
  }
  return out;
}
