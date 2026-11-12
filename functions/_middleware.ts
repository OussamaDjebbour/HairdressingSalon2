/**
 * Runs in front of every request on Cloudflare Pages. For HTML pages it writes the salon's tab
 * title, theme colour, home-screen name, description and brand colours into <head> before any
 * JavaScript runs, so a salon's site never flashes another salon's name or colours. An unknown
 * host or a failed lookup leaves the page exactly as built (neutral head; the app then shows
 * "salon introuvable" or its retry screen): this must never break a page.
 */
import { headTags, normalizeHost } from './_lib/head';
import { lookupSalon, type Env } from './_lib/lookup';

/** A page navigation (not an asset, fetch or service-worker request). */
function isNavigation(request: Request): boolean {
  return (request.headers.get('Accept') ?? '').includes('text/html') || request.headers.get('Sec-Fetch-Dest') === 'document';
}

export const onRequest: PagesFunction<Env> = async (context) => {
  // The built index.html is the same file for every salon, so its static validators say nothing
  // about the branding written below: a navigation never revalidates, else a 304 would keep a
  // copy carrying another salon's (or the neutral fallback's) head.
  const req = context.request;
  let response: Response;
  if (isNavigation(req) && (req.headers.has('If-None-Match') || req.headers.has('If-Modified-Since'))) {
    const headers = new Headers(req.headers);
    headers.delete('If-None-Match');
    headers.delete('If-Modified-Since');
    response = await context.next(new Request(req, { headers }));
  } else {
    response = await context.next();
  }
  if (!(response.headers.get('Content-Type') ?? '').includes('text/html')) return response;

  let tags: ReturnType<typeof headTags>;
  let name: string;
  try {
    const salon = await lookupSalon(normalizeHost(new URL(req.url).host), context.env, (p) => context.waitUntil(p));
    if (!salon) return response;
    tags = headTags(salon);
    name = salon.name;
  } catch {
    return response;
  }

  // Drop the static validators too, so a browser has nothing to revalidate with.
  const headers = new Headers(response.headers);
  headers.delete('ETag');
  headers.delete('Last-Modified');
  const page = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  return new HTMLRewriter()
    .on('title', { element: (el) => void el.setInnerContent(tags.title, { html: false }) })
    .on('meta[name="theme-color"]', { element: (el) => void el.setAttribute('content', tags.themeColor) })
    .on('meta[name="apple-mobile-web-app-title"]', { element: (el) => void el.setAttribute('content', name) })
    .on('meta[name="description"]', { element: (el) => void el.setAttribute('content', tags.description) })
    // tags.style is built from validated #RRGGBB colours only (digits and fixed text).
    .on('head', { element: (el) => void el.append(`<style>${tags.style}</style>`, { html: true }) })
    .transform(page);
};
