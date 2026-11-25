/**
 * What the edge writes for a salon before any JavaScript runs: the page head (tab title, theme
 * colour, brand colours) and the home-screen app manifest. Pure; reuses the app's own
 * dependency-free modules so the edge and the app can't disagree.
 */
import { CREAM_50, isHexColor, type Palette } from '../../src/lib/palette';
import { paletteToCssVars } from '../../src/lib/brandVars';
import { SALON_DATA_ID } from '../../src/data/salonColumns';

export { normalizeHost } from '../../src/lib/host';

/** What the edge needs from a salon row, plus the row itself (SALON_COLUMNS) for the app. */
export interface EdgeSalon {
  id: string;
  name: string;
  palette: Palette;
  /** The whole row as the database gave it; the app validates it again (parseSalonRow). */
  row: Record<string, unknown>;
}

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;

/** A salon row from the database, or null when it isn't one we can safely render. */
export function toEdgeSalon(row: unknown): EdgeSalon | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as { id?: unknown; name?: unknown; palette?: unknown };
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || r.name === '') return null;
  if (!r.palette || typeof r.palette !== 'object') return null;
  const p = r.palette as Record<string, unknown>;
  const palette = {} as Palette;
  for (const shade of SHADES) {
    const hex = p[shade];
    if (typeof hex !== 'string' || !isHexColor(hex)) return null;
    palette[shade] = hex;
  }
  return { id: r.id, name: r.name, palette, row: row as Record<string, unknown> };
}

/** JSON that is safe inside a <script> element (no `</script>`, no HTML comment, no entity). */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Extra <head> tags so the page paints sooner: the salon row for this domain (the app starts from
 * it instead of asking the database, src/data/currentSalon.ts) and, on the home page, a preload of
 * the hero photo so it downloads while the app's code does.
 */
export function salonDataTags(salon: EdgeSalon, domain: string, path: string): string {
  let tags = `<script id="${SALON_DATA_ID}" type="application/json">${scriptJson({ domain, salon: salon.row })}</script>`;
  const hero = salon.row.hero_image;
  if (path === '/' && typeof hero === 'string' && hero.startsWith('https://')) {
    tags += `<link rel="preload" as="image" href="${escapeAttr(hero)}" fetchpriority="high">`;
  }
  return tags;
}

/** Same tab title the app sets at runtime (src/bootstrap.tsx). */
export function headTags(salon: EdgeSalon): { title: string; themeColor: string; description: string; style: string } {
  const vars = Object.entries(paletteToCssVars(salon.palette))
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  return {
    title: `${salon.name} — Salon de beauté`,
    themeColor: salon.palette['900'],
    description: `${salon.name} — salon de coiffure et de beauté. Réservez votre rendez-vous en ligne.`,
    style: `:root{${vars}}`,
  };
}

/** The staff app's manifest (public/manifest.webmanifest is Élégance's copy, for local dev). */
export function manifestFor(salon: EdgeSalon) {
  return {
    name: `${salon.name} — Espace salon`,
    short_name: salon.name,
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    background_color: CREAM_50,
    theme_color: salon.palette['900'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
}
