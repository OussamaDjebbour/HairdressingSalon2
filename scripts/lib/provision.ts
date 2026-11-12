/**
 * Turns a validated salon config into the jsonb `public.provision_salon` takes (its shape is
 * documented at the top of the function in supabase/migrations/20261114100000_salon_branding.sql).
 * Keys the config leaves out are left out of the payload too, so the salon keeps their current
 * value (the owner's Réglages edits); every key the config lists is (re-)applied. Pure.
 */
import type { Palette } from '../../src/lib/palette';
import { normalizeHost } from '../../src/lib/host';
import { isLocalPhoto, parseHoursRange, WEEKDAYS, type Bilingual, type SalonConfig } from './config';

export type BilingualText = { fr: string; ar: string };

export interface ServicePayload {
  id: string;
  category: 'coiffure' | 'beaute';
  name: BilingualText;
  description?: BilingualText;
  price: number;
  duration: number;
  image?: string;
}

export interface StylistPayload {
  id: string;
  name: string;
  role?: BilingualText;
  image?: string;
  services: string[];
  weekdays?: number[];
}

export interface ProvisionPayload {
  id: string;
  name: string;
  name_ar: string;
  palette: Palette;
  hero_image?: string;
  founder_name?: BilingualText;
  founder_role?: BilingualText;
  story?: BilingualText;
  story_intro?: BilingualText;
  years_open?: number;
  client_count?: number;
  rating?: number;
  review_count?: number;
  address: BilingualText;
  city: BilingualText;
  whatsapp: string;
  instagram_url?: string;
  facebook_url?: string;
  domains: string[];
  hours: Array<{ weekday: number; opens: string | null; closes: string | null }>;
  services: ServicePayload[];
  stylists: StylistPayload[];
  owner_user_id?: string;
}

/** {fr, ar?} -> {fr, ar}: a missing Arabic text falls back to the French one. */
export function bilingual(b: Bilingual): BilingualText {
  return { fr: b.fr, ar: b.ar?.trim() ? b.ar : b.fr };
}

/** Every photo the config gives as a local file (under salons/<slug>/photos/), once each. */
export function localPhotos(config: SalonConfig): string[] {
  const refs = [config.heroPhoto, ...config.services.map((s) => s.photo), ...config.stylists.map((s) => s.photo)];
  return [...new Set(refs.filter((r): r is string => r !== undefined && isLocalPhoto(r)))];
}

/** Where a local photo is stored in the `salon-photos` bucket. */
export function storagePath(salonId: string, ref: string): string {
  return `${salonId}/${ref}`;
}

export function buildProvisionPayload(
  config: SalonConfig,
  palette: Palette,
  photoUrls: Record<string, string>,
  ownerUserId?: string,
): ProvisionPayload {
  const image = (ref: string | undefined) => {
    if (ref === undefined) return {};
    if (!isLocalPhoto(ref)) return { image: ref };
    const url = photoUrls[ref];
    if (!url) throw new Error(`Photo "${ref}" has no uploaded URL`);
    return { image: url };
  };
  const optional = <T>(key: string, value: T | undefined) => (value === undefined ? {} : { [key]: value });
  const claims = config.claims ?? {};

  return {
    id: config.id,
    name: config.name.fr,
    name_ar: config.name.ar ?? '',
    palette,
    ...optional('hero_image', image(config.heroPhoto).image),
    ...optional('founder_name', config.founder && bilingual(config.founder.name)),
    ...optional('founder_role', config.founder?.role && bilingual(config.founder.role)),
    ...optional('story', config.story && bilingual(config.story)),
    ...optional('story_intro', config.storyIntro && bilingual(config.storyIntro)),
    ...optional('years_open', claims.yearsOpen),
    ...optional('client_count', claims.clientCount),
    ...optional('rating', claims.rating),
    ...optional('review_count', claims.reviewCount),
    address: bilingual(config.address),
    city: bilingual(config.city),
    whatsapp: config.whatsapp,
    ...optional('instagram_url', config.instagram),
    ...optional('facebook_url', config.facebook),
    domains: [...new Set(config.domains.map(normalizeHost))],
    hours: WEEKDAYS.map((day, i) => {
      const range = parseHoursRange(config.hours[day]);
      return { weekday: i + 1, opens: range?.[0] ?? null, closes: range?.[1] ?? null };
    }),
    services: config.services.map((s) => ({
      id: s.id,
      category: s.category,
      name: bilingual(s.name),
      ...(s.description && { description: bilingual(s.description) }),
      price: s.price,
      duration: s.duration,
      ...image(s.photo),
    })),
    stylists: config.stylists.map((s) => ({
      id: s.id,
      name: s.name,
      ...(s.role && { role: bilingual(s.role) }),
      ...image(s.photo),
      services: s.services,
      ...(s.workdays && { weekdays: s.workdays.map((d) => WEEKDAYS.indexOf(d) + 1) }),
    })),
    ...optional('owner_user_id', ownerUserId),
  } as ProvisionPayload;
}
