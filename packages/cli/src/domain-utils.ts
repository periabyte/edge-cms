/**
 * Heuristic apex/root-domain check (label count only — no public-suffix-list
 * lookup, so `foo.co.uk` reads as a subdomain). Good enough for a UX nudge,
 * not a source of truth for DNS behavior.
 */
export function isApexDomain(hostname: string): boolean {
  return hostname.split(".").length <= 2;
}
