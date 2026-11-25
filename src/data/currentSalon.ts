// Finds which salon a page serves from its web address. A wrong answer would show one salon's
// site and bookings on another's address, so an unknown host resolves to null (the "salon
// introuvable" page), never to a default salon.
import { supabase } from '../lib/supabase';
import { normalizeHost } from '../lib/host';
import type { CurrentSalon } from './salon';
import { SALON_COLUMNS, SALON_DATA_ID, parseSalonRow, toCurrentSalon, type SalonRow } from './salonRow';

export { normalizeHost };

/** Hosts where `?salon=<id>` may pick a salon (local development and `pnpm preview`). */
const DEV_HOSTS = ['localhost', '127.0.0.1'];

async function salonById(id: string): Promise<CurrentSalon | null> {
  const { data, error } = await supabase.from('salons').select(SALON_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toCurrentSalon(data as unknown as SalonRow) : null;
}

/**
 * The salon the edge middleware wrote into the page for this domain (saves a database round trip
 * before the first paint), or null when there is none, it was written for another domain, or it
 * isn't usable.
 */
export function embeddedSalon(domain: string, doc: Document = document): CurrentSalon | null {
  const text = doc.getElementById(SALON_DATA_ID)?.textContent;
  if (!text) return null;
  try {
    const data = JSON.parse(text) as { domain?: unknown; salon?: unknown };
    return data.domain === domain ? parseSalonRow(data.salon) : null;
  } catch {
    return null;
  }
}

/**
 * The salon for this page, or null when the address belongs to no salon. Throws on a network
 * or database error. Development overrides come first: `VITE_SALON_ID` (dev server only, never
 * in a production build), then `?salon=<id>` but only on localhost / 127.0.0.1. Then the copy the
 * edge wrote into the page for this domain, else the database.
 */
export async function resolveSalon(host: string, search: string): Promise<CurrentSalon | null> {
  const envId = import.meta.env.DEV ? import.meta.env.VITE_SALON_ID : undefined;
  if (envId) return salonById(envId);

  const domain = normalizeHost(host);
  if (DEV_HOSTS.includes(domain)) {
    const queryId = new URLSearchParams(search).get('salon');
    if (queryId) return salonById(queryId);
  }

  const embedded = embeddedSalon(domain);
  if (embedded) return embedded;

  const { data, error } = await supabase
    .from('salon_domains')
    .select(`salon:salons(${SALON_COLUMNS})`)
    .eq('domain', domain)
    .maybeSingle();
  if (error) throw error;
  const salon = (data as { salon: SalonRow | null } | null)?.salon;
  return salon ? toCurrentSalon(salon) : null;
}
