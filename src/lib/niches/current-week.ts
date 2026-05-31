export function isoWeekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

export interface BandableCluster {
  id: string;
  niche_score: number | null;
  proven_score: number | null;
  first_mover_score: number | null;
  digest_rank: number | null;
}

export function partitionBands<T extends BandableCluster>(clusters: T[]): { proven: T[]; unproven: T[] } {
  const proven = clusters.filter((c) => (c.proven_score ?? 0) > 0.6);
  const unproven = clusters.filter((c) => (c.proven_score ?? 0) <= 0.6 && (c.first_mover_score ?? 0) > 0.7);
  return { proven, unproven };
}
