/**
 * Service, stylist and category ids are shared by every salon (each is a primary key), so the launch script puts the
 * salon id in front of the short ids of a salons/<slug>.json ("amina" → "yasmine-amina"): two salons can each have an
 * Amina. An id already starting with "<salon>-" is left as it is, and so is an id this salon already uses (a salon
 * launched before the prefix existed keeps its rows instead of getting copies). Pure.
 */
import type { SalonConfig } from './config';

/** The stored id for a short id of this salon's file. */
export function salonItemId(salonId: string, id: string, keep: ReadonlySet<string> = new Set()): string {
  return keep.has(id) || id.startsWith(`${salonId}-`) ? id : `${salonId}-${id}`;
}

/** The file with every service, stylist and category id prefixed, and every reference to them (a copy). */
export function prefixConfigIds(config: SalonConfig, keep: ReadonlySet<string> = new Set()): SalonConfig {
  const id = (x: string) => salonItemId(config.id, x, keep);
  const category = (c: string) => (c.startsWith('custom:') ? `custom:${id(c.slice('custom:'.length))}` : c);
  return {
    ...config,
    ...(config.categories && { categories: config.categories.map((c) => ({ ...c, id: id(c.id) })) }),
    services: config.services.map((s) => ({ ...s, id: id(s.id), category: category(s.category) as typeof s.category })),
    stylists: config.stylists.map((s) => ({ ...s, id: id(s.id), services: s.services.map(id) })),
  };
}
