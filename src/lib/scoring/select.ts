import { cosine } from "@/lib/clustering/cosine";

export type Band = "proven" | "unproven" | "none";

export interface ScoredCandidate {
  id: string;
  nicheScore: number;
  provenScore: number | null;
  firstMoverScore: number | null;
  embedding: number[];
}

export interface RankedCandidate extends ScoredCandidate { band: Band; digestRank: number }

const PROVEN_FLOOR = 0.6;
const FIRST_MOVER_FLOOR = 0.7;

export function assignBand(c: ScoredCandidate): Band {
  const proven = c.provenScore ?? 0;
  if (proven > PROVEN_FLOOR) return "proven";
  if ((c.firstMoverScore ?? 0) > FIRST_MOVER_FLOOR) return "unproven";
  return "none";
}

/** MMR pick from one band: maximize lambda*niche - (1-lambda)*maxSimToPicked. */
function mmrPick(pool: ScoredCandidate[], count: number, lambda: number): ScoredCandidate[] {
  const picked: ScoredCandidate[] = [];
  const remaining = [...pool].sort((a, b) => b.nicheScore - a.nicheScore);
  while (picked.length < count && remaining.length > 0) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const maxSim = picked.length === 0 ? 0 : Math.max(...picked.map((p) => cosine(c.embedding, p.embedding)));
      const val = lambda * c.nicheScore - (1 - lambda) * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    picked.push(remaining.splice(bestIdx, 1)[0]);
  }
  return picked;
}

export function selectDigest(
  candidates: ScoredCandidate[],
  opts: { provenTarget: number; unprovenTarget: number; lambda: number },
): RankedCandidate[] {
  const proven = candidates.filter((c) => assignBand(c) === "proven");
  const unproven = candidates.filter((c) => assignBand(c) === "unproven");
  const pickedProven = mmrPick(proven, opts.provenTarget, opts.lambda).map((c) => ({ ...c, band: "proven" as const }));
  const pickedUnproven = mmrPick(unproven, opts.unprovenTarget, opts.lambda).map((c) => ({ ...c, band: "unproven" as const }));
  const merged = [...pickedProven, ...pickedUnproven].sort((a, b) => b.nicheScore - a.nicheScore);
  return merged.map((c, i) => ({ ...c, digestRank: i + 1 }));
}
