/**
 * Turns a validated salon config into the jsonb `public.provision_salon` takes (its shape is
 * documented at the top of the function in supabase/migrations/20261114100000_salon_branding.sql).
 * A key left out of the payload keeps the salon's current value. Left out:
 * - keys the config leaves out, and an empty `domains` list (it would remove every domain);
 * - unless `settings` is true, the owner's own settings (hours, address/city/WhatsApp/socials,
 *   services, stylists): sent when creating the salon, and on an existing salon only when the
 *   product owner asks to re-apply them, so re-runs never undo the owner's Réglages edits.
 * Pure.
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
  address?: BilingualText;
  city?: BilingualText;
  whatsapp?: string;
  instagram_url?: string;
  facebook_url?: string;
  domains?: string[];
  hours?: Array<{ weekday: number; opens: string | null; closes: string | null }>;
  services?: ServicePayload[];
  stylists?: StylistPayload[];
  owner_user_id?: string;
  add_owner?: true;
}

/**
 * The product owner's keys are always sent; `settings: true` also sends the owner's settings.
 * `addOwner` (--add-owner) lets the owner's login join an existing salon that already has other staff.
 */
export interface PayloadOptions {
  settings: boolean;
  addOwner?: boolean;
}

/** What provision_salon's error codes mean for the person running the script. */
const PROVISION_ERRORS: Record<string, string> = {
  invalid_id: 'the salon id is invalid',
  invalid_name: 'a name, address or city is too short or too long',
  invalid_palette: 'the palette is invalid',
  invalid_domain: 'a domain name is invalid',
  invalid_hours: 'the opening hours are invalid',
  invalid_phone: 'the WhatsApp number is not an Algerian mobile number',
  invalid_url: 'the Instagram/Facebook link must start with https://',
  invalid_service: 'a service is invalid (id, category, name, price or duration)',
  invalid_stylist: 'a stylist is invalid (id, name or workdays)',
  unknown_service: "a stylist offers a service that is not this salon's",
  domain_taken: 'a domain already belongs to another salon',
  id_taken: 'a service or stylist id is already used by another salon (ids are shared by all salons: prefix them with the salon id)',
  staff_taken: "the owner's email is already the login of another salon's staff",
  owner_conflict:
    'salon "{id}" already has its own staff and this owner\'s email is not one of them: the file probably reuses another salon\'s ' +
    'id — give it another "id". If this email really is an extra login of this salon, re-run with --add-owner',
};

/** provision_salon's error (its message is the code) as a readable sentence; unknown errors as they are. */
export function provisionErrorMessage(message: string, salonId: string): string {
  const code = message.trim();
  const text = PROVISION_ERRORS[code];
  return text ? `${text.replace('{id}', salonId)} (${code})` : message;
}

/** {fr, ar?} -> {fr, ar}: a missing Arabic text falls back to the French one. */
export function bilingual(b: Bilingual): BilingualText {
  return { fr: b.fr, ar: b.ar?.trim() ? b.ar : b.fr };
}

/** Every photo the payload needs as a local file (under salons/<slug>/photos/), once each. */
export function localPhotos(config: SalonConfig, { settings }: PayloadOptions = { settings: true }): string[] {
  const refs = [config.heroPhoto];
  if (settings) refs.push(...config.services.map((s) => s.photo), ...config.stylists.map((s) => s.photo));
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
  { settings, addOwner = false }: PayloadOptions = { settings: true },
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
  const domains = [...new Set(config.domains.map(normalizeHost))];

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
    ...(settings && {
      address: bilingual(config.address),
      city: bilingual(config.city),
      whatsapp: config.whatsapp,
      ...optional('instagram_url', config.instagram),
      ...optional('facebook_url', config.facebook),
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
    }),
    ...(domains.length > 0 && { domains }),
    ...optional('owner_user_id', ownerUserId),
    ...(addOwner && ownerUserId && { add_owner: true }),
  } as ProvisionPayload;
}
