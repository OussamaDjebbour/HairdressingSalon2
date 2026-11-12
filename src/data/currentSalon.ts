// Finds which salon a page serves from its web address. A wrong answer would show one salon's
// site and bookings on another's address, so an unknown host resolves to null (the "salon
// introuvable" page), never to a default salon.
import type { Lang } from '../context/LanguageContext';
import { supabase } from '../lib/supabase';
import type { Palette } from '../lib/palette';
import type { CurrentSalon } from './salon';

/** Hosts where `?salon=<id>` may pick a salon (local development and `pnpm preview`). */
const DEV_HOSTS = ['localhost', '127.0.0.1'];

const SALON_COLUMNS =
  'id, name, name_ar, palette, hero_image, founder_name, founder_role, story, story_intro, ' +
  'years_open, client_count, rating, review_count';

interface SalonRow {
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
}

/**
 * Same rules as `private.normalize_host` (how salon_domains stores domains): lowercase, trim
 * spaces, then strip a `:port`, trailing dots and one leading `www.`.
 * 'WWW.Sara-Salon.com.:443' -> 'sara-salon.com'.
 */
export function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^ +| +$/g, '')
    .replace(/:[0-9]*$/, '')
    .replace(/\.+$/, '')
    .replace(/^www\./, '');
}

function bilingual(value: unknown): Record<Lang, string> | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<Record<Lang, unknown>>;
  if (typeof v.fr !== 'string' || v.fr === '') return null;
  return { fr: v.fr, ar: typeof v.ar === 'string' && v.ar !== '' ? v.ar : v.fr };
}

function toCurrentSalon(r: SalonRow): CurrentSalon {
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
  };
}

async function salonById(id: string): Promise<CurrentSalon | null> {
  const { data, error } = await supabase.from('salons').select(SALON_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toCurrentSalon(data as unknown as SalonRow) : null;
}

/**
 * The salon for this page, or null when the address belongs to no salon. Throws on a network
 * or database error. Development overrides come first: `VITE_SALON_ID` (dev server only, never
 * in a production build), then `?salon=<id>` but only on localhost / 127.0.0.1.
 */
export async function resolveSalon(host: string, search: string): Promise<CurrentSalon | null> {
  const envId = import.meta.env.DEV ? import.meta.env.VITE_SALON_ID : undefined;
  if (envId) return salonById(envId);

  const domain = normalizeHost(host);
  if (DEV_HOSTS.includes(domain)) {
    const queryId = new URLSearchParams(search).get('salon');
    if (queryId) return salonById(queryId);
  }

  const { data, error } = await supabase
    .from('salon_domains')
    .select(`salon:salons(${SALON_COLUMNS})`)
    .eq('domain', domain)
    .maybeSingle();
  if (error) throw error;
  const salon = (data as { salon: SalonRow | null } | null)?.salon;
  return salon ? toCurrentSalon(salon) : null;
}
