/**
 * /calendar.ics?d=YYYY-MM-DD&t=HH:MM&s=<service ids>&l=fr|ar: the client's booked visit as a calendar
 * file, served from the salon's own address so iPhone Safari opens its "Add to Calendar" sheet
 * (a file built in the page only downloads). The request carries no free text: the title,
 * durations and address come from this salon's own rows, so nobody can craft another invite on a
 * salon's domain. Unknown host → 404 (never another salon); lookup or database failure → 503.
 */
import { normalizeHost } from './_lib/head';
import { lookupSalon, type Env } from './_lib/lookup';
import { algiersInstant, joinAddress, parseCalendarRequest, visitIcs } from '../src/lib/calendar';

type Bilingual = { fr?: string; ar?: string };

const plain = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const req = parseCalendarRequest(url.searchParams);
  if (!req) return plain('Bad request', 400);

  let salon;
  try {
    salon = await lookupSalon(normalizeHost(url.host), context.env, (p) => context.waitUntil(p));
  } catch {
    return plain('Service unavailable', 503);
  }
  if (!salon) return plain('Not found', 404);

  const base = `${context.env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;
  const headers = { apikey: context.env.SUPABASE_PUBLISHABLE_KEY };
  const sid = encodeURIComponent(salon.id);
  let services: { id: string; name: Bilingual; duration: number }[];
  let row: { address: Bilingual | null; city: Bilingual | null } | undefined;
  try {
    const [s, r] = await Promise.all([
      fetch(`${base}/services?select=id,name,duration&salon_id=eq.${sid}&id=in.(${req.serviceIds.map(encodeURIComponent).join(',')})`, { headers }),
      fetch(`${base}/salons?select=address,city&id=eq.${sid}`, { headers }),
    ]);
    if (!s.ok || !r.ok) throw new Error(`HTTP ${s.status}/${r.status}`);
    services = await s.json();
    row = ((await r.json()) as (typeof row)[])[0];
  } catch {
    return plain('Service unavailable', 503);
  }

  // In the order she booked them; any id that isn't this salon's makes the request unknown.
  const parts = req.serviceIds.map((id) => services.find((x) => x.id === id));
  if (parts.some((p) => !p)) return plain('Not found', 404);
  const booked = parts as typeof services;

  const lang = req.lang;
  const pick = (b: Bilingual | null | undefined) => b?.[lang] || b?.fr || '';
  const start = algiersInstant(req.date, req.time);
  const end = new Date(start.getTime() + booked.reduce((sum, p) => sum + p.duration, 0) * 60_000);
  const ics = visitIcs(
    {
      salon: salon.name,
      services: booked.map((p) => pick(p.name)),
      start,
      end,
      location: joinAddress(pick(row?.address), pick(row?.city)),
      lang,
    },
    `${salon.id}-${req.date}-${req.time.replace(':', '')}-${req.serviceIds.join('+')}@salons`,
  );
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="rendez-vous.ics"',
      'Cache-Control': 'no-store',
    },
  });
};
