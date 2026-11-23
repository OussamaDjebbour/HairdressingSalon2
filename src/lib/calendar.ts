/**
 * A booked visit in the client's own calendar: the event's title, a Google Calendar link, and an
 * .ics file (with a reminder the day before) served by the edge at /calendar.ics.
 * Dependency-free: shared by the browser app and the Cloudflare edge functions, so its few words
 * live here in both languages rather than in the app's translations.
 */

export type CalendarLang = 'fr' | 'ar';

const TEXT: Record<CalendarLang, { pending: string; details: string; reminder: string }> = {
  fr: {
    pending: '(à confirmer)',
    details: 'En attente de confirmation par le salon.',
    reminder: 'Rendez-vous demain chez {salon}',
  },
  ar: {
    pending: '(بانتظار التأكيد)',
    details: 'في انتظار تأكيد الصالون.',
    reminder: 'موعدك غدًا في {salon}',
  },
};

export interface CalendarVisit {
  salon: string;
  /** The visit's services in their booked order. */
  services: string[];
  start: Date;
  end: Date;
  location: string;
  lang: CalendarLang;
}

/** "Élégance — Coupe & Brushing + Manucure (à confirmer)": online bookings wait for the salon's confirmation. */
export function visitTitle(v: CalendarVisit): string {
  return `${v.salon} — ${v.services.join(' + ')} ${TEXT[v.lang].pending}`;
}

/**
 * The salon's address lines and city on one line: "12 Rue Didouche Mourad, Alger Centre 16000, Alger".
 * The city is left out when the address already ends with it as a word ("…, 31000 Oran", not "…, 31000 Oran, Oran").
 */
export function joinAddress(address: string, city: string): string {
  const lines = address.split('\n').map((s) => s.trim()).filter(Boolean);
  const c = city.trim();
  const last = (lines[lines.length - 1] ?? '').toLocaleLowerCase();
  const lc = c.toLocaleLowerCase();
  const endsWithCity = lc !== '' && last.endsWith(lc) && !/\p{L}/u.test(last.charAt(last.length - lc.length - 1));
  return (c && !endsWithCity ? [...lines, c] : lines).join(', ');
}

/** RFC 5545 / Google date-time in UTC: 20300108T090000Z. */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Opens Google Calendar with the event filled in; she only taps Save. (Google keeps her default reminder.) */
export function googleCalendarLink(v: CalendarVisit): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: visitTitle(v),
    dates: `${utcStamp(v.start)}/${utcStamp(v.end)}`,
    details: TEXT[v.lang].details,
    location: v.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** RFC 5545 text: backslash, comma, semicolon and newlines escaped. */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
}

/** RFC 5545 folding: at most 75 octets per line, continuations start with a space; never splits a character. */
function fold(line: string): string[] {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // a continuation's leading space counts
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`));
}

/** A one-event calendar file for the visit, with a reminder the day before. */
export function visitIcs(v: CalendarVisit, uid: string, now: Date = new Date()): string {
  const title = visitTitle(v);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Salon//Rendez-vous//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(v.start)}`,
    `DTEND:${utcStamp(v.end)}`,
    `SUMMARY:${icsText(title)}`,
    `LOCATION:${icsText(v.location)}`,
    `DESCRIPTION:${icsText(TEXT[v.lang].details)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(TEXT[v.lang].reminder.replace('{salon}', v.salon))}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.flatMap(fold).join('\r\n')}\r\n`;
}

/** A salon date and time ("2030-01-08", "10:00") as an instant: Algeria is UTC+1 all year. */
export function algiersInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+01:00`);
}

/** What /calendar.ics needs: no free text, so nobody can craft another invite on a salon's address. */
export interface CalendarRequest {
  /** YYYY-MM-DD, the salon's day. */
  date: string;
  /** HH:MM, the visit's start. */
  time: string;
  /** 1 to 4 of the salon's service ids, in the visit's order. */
  serviceIds: string[];
  lang: CalendarLang;
}

export const MAX_CALENDAR_SERVICES = 4;
const SERVICE_ID = /^[A-Za-z0-9-]{1,64}$/;

/** The same-site address of the visit's .ics file (served by the edge function). */
export function calendarFileUrl(r: CalendarRequest): string {
  const params = new URLSearchParams({ d: r.date, t: r.time, s: r.serviceIds.join(','), l: r.lang });
  return `/calendar.ics?${params.toString()}`;
}

/** The request behind /calendar.ics, or null when anything is not a real date, time or service list. */
export function parseCalendarRequest(params: URLSearchParams): CalendarRequest | null {
  const date = params.get('d') ?? '';
  const time = params.get('t') ?? '';
  const ids = (params.get('s') ?? '').split(',');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  if (ids.length < 1 || ids.length > MAX_CALENDAR_SERVICES || !ids.every((id) => SERVICE_ID.test(id))) return null;
  return { date, time, serviceIds: ids, lang: params.get('l') === 'ar' ? 'ar' : 'fr' };
}
