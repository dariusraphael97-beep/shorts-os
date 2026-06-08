// src/lib/niches/auto-pick.ts
// Picks the single best niche for the "Generate my best niche" hero.
// Prefers the dominatable (first-mover / "unproven") band per the niche playbook;
// falls back to the strongest proven niche. Only native-fit niches are auto-generatable.
import { assignBand, type Band } from "@/lib/scoring/select";

export interface PickableCluster {
  id: string;
  canonical_topic: string;
  production_fit: string;
  niche_score: number | null;
  proven_score: number | null;
  first_mover_score: number | null;
}

export interface NichePick {
  cluster: PickableCluster;
  band: Band;
  reason: string;
}

export function pickBestNiche(clusters: PickableCluster[]): NichePick | null {
  const native = clusters.filter((c) => c.production_fit === "native");
  const banded = native
    .map((c) => ({
      cluster: c,
      band: assignBand({
        id: c.id,
        nicheScore: c.niche_score ?? 0,
        provenScore: c.proven_score,
        firstMoverScore: c.first_mover_score,
        embedding: [],
      }),
    }))
    .filter((x) => x.band !== "none");

  if (banded.length === 0) return null;

  const dominatable = banded.filter((x) => x.band === "unproven");
  if (dominatable.length > 0) {
    const best = dominatable.sort(
      (a, b) => (b.cluster.first_mover_score ?? 0) - (a.cluster.first_mover_score ?? 0),
    )[0];
    return {
      cluster: best.cluster,
      band: "unproven",
      reason: "Highest first-mover signal — a dominatable niche (algorithm-driven, views ≫ subs).",
    };
  }

  const best = banded.sort((a, b) => (b.cluster.niche_score ?? 0) - (a.cluster.niche_score ?? 0))[0];
  return { cluster: best.cluster, band: best.band, reason: "Strongest proven niche this week." };
}
