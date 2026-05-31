declare module 'google-trends-api' {
  export function dailyTrends(options: { geo: string; trendDate?: Date }): Promise<string>;
  const _default: { dailyTrends: typeof dailyTrends };
  export default _default;
}
