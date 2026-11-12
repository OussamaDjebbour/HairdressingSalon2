/**
 * What the edge writes for a salon before any JavaScript runs: the page head (tab title, theme
 * colour, brand colours) and the home-screen app manifest. Pure; reuses the app's own
 * dependency-free modules so the edge and the app can't disagree.
 */
import { CREAM_50, isHexColor, type Palette } from '../../src/lib/palette';
import { paletteToCssVars } from '../../src/lib/brandVars';

export { normalizeHost } from '../../src/lib/host';

/** The salon columns the edge needs (salons.id, salons.name, salons.palette). */
export interface EdgeSalon {
  id: string;
  name: string;
  palette: Palette;
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
  return { id: r.id, name: r.name, palette };
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
