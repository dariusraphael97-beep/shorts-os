export function cosine(a: number[], b: number[]): number {
  // Defensive: dimension mismatch (e.g. embeddings from different model versions) → treat as dissimilar.
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Greedy merge of near-duplicate topic labels. Process by descending frequency;
 * each label joins an existing canonical (cosine >= threshold to its representative)
 * or becomes a new canonical. Returns label -> canonical map.
 */
export function fuzzyMergeTopics(
  labels: string[],
  embeddings: Map<string, number[]>,
  counts: Map<string, number>,
  threshold: number,
): Map<string, string> {
  const ordered = [...labels].sort((x, y) => (counts.get(y) ?? 0) - (counts.get(x) ?? 0));
  const canonicals: string[] = [];
  const map = new Map<string, string>();
  for (const label of ordered) {
    const emb = embeddings.get(label);
    if (!emb) { map.set(label, label); canonicals.push(label); continue; }
    let best: { canon: string; sim: number } | null = null;
    for (const canon of canonicals) {
      const cEmb = embeddings.get(canon);
      if (!cEmb) continue;
      const sim = cosine(emb, cEmb);
      if (sim >= threshold && (!best || sim > best.sim)) best = { canon, sim };
    }
    if (best) map.set(label, best.canon);
    else { map.set(label, label); canonicals.push(label); }
  }
  return map;
}
