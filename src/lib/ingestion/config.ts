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
