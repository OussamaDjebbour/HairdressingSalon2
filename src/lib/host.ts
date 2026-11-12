/**
 * Same rules as `private.normalize_host` (how salon_domains stores domains): lowercase, trim
 * spaces, then strip a `:port`, trailing dots and one leading `www.`.
 * 'WWW.Sara-Salon.com.:443' -> 'sara-salon.com'.
 * Dependency-free: shared by the browser app and the Cloudflare edge functions.
 */
export function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^ +| +$/g, '')
    .replace(/:[0-9]*$/, '')
    .replace(/\.+$/, '')
    .replace(/^www\./, '');
}
