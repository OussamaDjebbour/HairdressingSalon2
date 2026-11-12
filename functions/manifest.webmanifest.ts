/**
 * The staff app's home-screen manifest for the salon at this address (name, colours). Takes
 * precedence over the static public/manifest.webmanifest, which stays as Élégance's copy for
 * local development without the edge.
 */
import { manifestFor, normalizeHost } from './_lib/head';
import { lookupSalon, type Env } from './_lib/lookup';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  let salon;
  try {
    salon = await lookupSalon(normalizeHost(new URL(context.request.url).host), context.env);
  } catch {
    // Never fall back to the static (Élégance) manifest for another salon's address.
    return new Response('Service unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!salon) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(manifestFor(salon)), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
