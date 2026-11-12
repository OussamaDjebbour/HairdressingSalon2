/**
 * Finds the salon for a (normalised) host through the Supabase REST API, as the browser app
 * does (salon_domains is readable with the publishable key). Answers, "not found" included,
 * are kept 5 minutes in the Cloudflare cache; errors are thrown and never cached. The cache is
 * best effort: if it fails to read or write, the lookup still answers.
 */
import { toEdgeSalon, type EdgeSalon } from './head';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

const CACHE_SECONDS = 300;

/** The request's waitUntil: lets the cache write finish after the response is sent. */
export type WaitUntil = (promise: Promise<unknown>) => void;

/** Workers' default cache, or null where the Cache API doesn't exist. */
function edgeCache(): Cache | null {
  const c = (globalThis as { caches?: { default?: Cache } }).caches;
  return c?.default ?? null;
}

export async function lookupSalon(host: string, env: Env, waitUntil?: WaitUntil): Promise<EdgeSalon | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set');
  }
  const cache = edgeCache();
  // Keyed under the salon's own address, so the entry lives in that domain's cache.
  const key = new Request(`https://${host}/__salon-lookup`);
  try {
    const hit = await cache?.match(key);
    if (hit) return ((await hit.json()) as { salon: EdgeSalon | null }).salon;
  } catch {
    // unreadable cache: ask the database
  }

  const url =
    `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/salon_domains` +
    `?domain=eq.${encodeURIComponent(host)}&select=salon:salons(id,name,palette)`;
  const res = await fetch(url, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } });
  if (!res.ok) throw new Error(`salon lookup failed: HTTP ${res.status}`);
  const rows = (await res.json()) as { salon: unknown }[];

  let salon: EdgeSalon | null = null;
  if (rows.length > 0) {
    salon = toEdgeSalon(rows[0].salon);
    if (!salon) throw new Error(`salon lookup: unusable salon row for ${host}`);
  }

  if (cache) {
    const write = (async () => {
      try {
        await cache.put(
          key,
          new Response(JSON.stringify({ salon }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` },
          }),
        );
      } catch {
        // not cached this time; the next request asks the database again
      }
    })();
    if (waitUntil) waitUntil(write);
    else await write;
  }
  return salon;
}
