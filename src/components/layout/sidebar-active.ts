/**
 * Given the current pathname and the set of nav hrefs, return the href that
 * should render active: the LONGEST href that is the pathname exactly or a
 * path-segment prefix of it (`href` followed by `/`). Returns null if none.
 *
 * Longest-prefix wins so `/niches/watch-list` lights up Watch-list (not Niches),
 * while `/niches/abc` and `/lab/drafts` light up their section roots.
 */
export function resolveActiveHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const isMatch = pathname === href || pathname.startsWith(href + "/");
    if (isMatch && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
