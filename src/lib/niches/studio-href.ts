/** Canonical URL to open the generation cockpit for a niche cluster (plans, then redirects to the draft). */
export function studioHref(clusterId: string): string {
  return `/niches/studio?cluster=${encodeURIComponent(clusterId)}`;
}
