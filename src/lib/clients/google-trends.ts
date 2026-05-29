import googleTrends from 'google-trends-api';

export interface TrendingSearch {
  title: string;
  traffic: string;
  relatedQueries: string[];
}

export interface TrendsClient {
  dailyTrends(params: { geo: string }): Promise<TrendingSearch[]>;
}

interface RawDailyTrends {
  default?: {
    trendingSearchesDays?: Array<{
      trendingSearches?: Array<{
        title?: { query?: string };
        formattedTraffic?: string;
        relatedQueries?: Array<{ query?: string }>;
      }>;
    }>;
  };
}

export const realTrendsClient: TrendsClient = {
  async dailyTrends({ geo }) {
    const raw = await googleTrends.dailyTrends({ geo });
    const parsed = JSON.parse(raw) as RawDailyTrends;
    const days = parsed.default?.trendingSearchesDays ?? [];
    const out: TrendingSearch[] = [];
    for (const day of days) {
      for (const s of day.trendingSearches ?? []) {
        const title = s.title?.query;
        if (!title) continue;
        out.push({
          title,
          traffic: s.formattedTraffic ?? '',
          relatedQueries: (s.relatedQueries ?? []).map((q) => q.query ?? '').filter(Boolean),
        });
      }
    }
    return out;
  },
};
