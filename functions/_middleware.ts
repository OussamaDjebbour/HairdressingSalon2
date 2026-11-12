/**
 * Runs in front of every request on Cloudflare Pages. For HTML pages it writes the salon's tab
 * title, theme colour, home-screen name and brand colours into <head> before any JavaScript
 * runs, so a salon's site never flashes another salon's name or colours. An unknown host or a
 * failed lookup leaves the page exactly as built (the app then shows "salon introuvable" or
 * its retry screen): this must never break a page.
 */
import { headTags, normalizeHost } from './_lib/head';
import { lookupSalon, type Env } from './_lib/lookup';

export const onRequest: PagesFunction<Env> = async (context) => {
  const response = await context.next();
  if (!(response.headers.get('Content-Type') ?? '').includes('text/html')) return response;

  let tags: ReturnType<typeof headTags>;
  let name: string;
  try {
    const salon = await lookupSalon(normalizeHost(new URL(context.request.url).host), context.env);
    if (!salon) return response;
    tags = headTags(salon);
    name = salon.name;
  } catch {
    return response;
  }

  // The built index.html is the same file for every salon: drop its validators so a browser
  // never revalidates (304) and keeps a copy carrying another salon's or older branding.
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
    // tags.style is built from validated #RRGGBB colours only (digits and fixed text).
    .on('head', { element: (el) => void el.append(`<style>${tags.style}</style>`, { html: true }) })
    .transform(page);
};
