// A salon row (public.salons) and how the app reads it: from its own query, or from the copy the
// edge middleware wrote into the page (functions/_lib/head.ts, same columns: salonColumns.ts).
import type { Lang } from '../context/LanguageContext';
import { isHexColor, type Palette } from '../lib/palette';
import type { CurrentSalon } from './salon';

export { SALON_COLUMNS, SALON_DATA_ID } from './salonColumns';

export interface SalonRow {
  id: string;
  name: string;
  name_ar: string | null;
  palette: Palette;
  hero_image: string;
  founder_name: unknown;
  founder_role: unknown;
  story: unknown;
  story_intro: unknown;
  years_open: number | null;
  client_count: number | null;
  rating: number | string | null;
  review_count: number | null;
  demo: boolean | null;
}

function bilingual(value: unknown): Record<Lang, string> | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<Record<Lang, unknown>>;
  if (typeof v.fr !== 'string' || v.fr === '') return null;
  return { fr: v.fr, ar: typeof v.ar === 'string' && v.ar !== '' ? v.ar : v.fr };
}

export function toCurrentSalon(r: SalonRow): CurrentSalon {
  return {
    id: r.id,
    name: { fr: r.name, ar: r.name_ar || r.name },
    palette: r.palette,
    heroImage: r.hero_image,
    founderName: bilingual(r.founder_name),
    founderRole: bilingual(r.founder_role),
    story: bilingual(r.story),
    storyIntro: bilingual(r.story_intro),
    yearsOpen: r.years_open ?? null,
    clientCount: r.client_count ?? null,
    rating: r.rating == null ? null : Number(r.rating),
    reviewCount: r.review_count ?? null,
    demo: r.demo === true,
  };
}

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * A salon row from outside the app's own query (the copy the edge wrote into the page), or null
 * when it is not one the app can safely start from: then the app asks the database as usual.
 */
export function parseSalonRow(row: unknown): CurrentSalon | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '' || typeof r.name !== 'string' || r.name === '') return null;
  if (!r.palette || typeof r.palette !== 'object') return null;
  const p = r.palette as Record<string, unknown>;
  const palette = {} as Palette;
  for (const shade of SHADES) {
    const hex = p[shade];
    if (typeof hex !== 'string' || !isHexColor(hex)) return null;
    palette[shade] = hex;
  }
  const rating = typeof r.rating === 'string' ? Number(r.rating) : r.rating;
  return toCurrentSalon({
    id: r.id,
    name: r.name,
    name_ar: typeof r.name_ar === 'string' ? r.name_ar : null,
    palette,
    hero_image: typeof r.hero_image === 'string' ? r.hero_image : '',
    founder_name: r.founder_name,
    founder_role: r.founder_role,
    story: r.story,
    story_intro: r.story_intro,
    years_open: numberOrNull(r.years_open),
    client_count: numberOrNull(r.client_count),
    rating: numberOrNull(rating),
    review_count: numberOrNull(r.review_count),
    demo: r.demo === true,
  });
}
