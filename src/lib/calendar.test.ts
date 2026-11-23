import { describe, expect, it } from 'vitest';
import {
  algiersInstant,
  calendarFileUrl,
  googleCalendarLink,
  joinAddress,
  parseCalendarRequest,
  visitIcs,
  visitTitle,
  type CalendarVisit,
} from './calendar';

const visit: CalendarVisit = {
  salon: 'Élégance',
  services: ['Coupe & Brushing', 'Manucure'],
  start: new Date('2030-01-08T09:00:00Z'),
  end: new Date('2030-01-08T10:45:00Z'),
  location: '15 rue Larbi Ben M’hidi, 31000 Oran',
  lang: 'fr',
};

describe('visitTitle', () => {
  it('names the salon and the services, and says the visit is still to be confirmed', () => {
    expect(visitTitle(visit)).toBe('Élégance — Coupe & Brushing + Manucure (à confirmer)');
    expect(visitTitle({ ...visit, lang: 'ar', services: ['قص'] })).toBe('Élégance — قص (بانتظار التأكيد)');
  });
});

describe('googleCalendarLink', () => {
  it('opens Google Calendar with the event filled in, times in UTC', () => {
    const url = new URL(googleCalendarLink(visit));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Élégance — Coupe & Brushing + Manucure (à confirmer)');
    expect(url.searchParams.get('dates')).toBe('20300108T090000Z/20300108T104500Z');
    expect(url.searchParams.get('location')).toBe('15 rue Larbi Ben M’hidi, 31000 Oran');
    expect(url.searchParams.get('details')).toBe('En attente de confirmation par le salon.');
  });
});

describe('visitIcs', () => {
  const ics = visitIcs(visit, 'abc@salons', new Date('2029-12-31T12:00:00Z'));
  const lines = ics.split('\r\n');

  it('has one event with UTC times, escaped text and CRLF lines', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines).toContain('DTSTART:20300108T090000Z');
    expect(lines).toContain('DTEND:20300108T104500Z');
    expect(lines).toContain('DTSTAMP:20291231T120000Z');
    expect(lines).toContain('UID:abc@salons');
    expect(lines).toContain('LOCATION:15 rue Larbi Ben M’hidi\\, 31000 Oran');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('reminds her the day before', () => {
    const alarm = lines.slice(lines.indexOf('BEGIN:VALARM'), lines.indexOf('END:VALARM') + 1);
    expect(alarm).toContain('ACTION:DISPLAY');
    expect(alarm).toContain('TRIGGER:-P1D');
    expect(alarm.some((l) => l.startsWith('DESCRIPTION:'))).toBe(true);
  });

  it('folds lines longer than 75 octets without splitting a character', () => {
    const long = visitIcs({ ...visit, lang: 'ar', services: ['قص وتصفيف الشعر', 'مانيكير وطلاء الأظافر', 'عناية بالوجه'] }, 'x');
    const encoder = new TextEncoder();
    for (const line of long.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding (drop CRLF + space) gives back the whole title.
    const unfolded = long.replace(/\r\n /g, '');
    expect(unfolded).toContain('SUMMARY:Élégance — قص وتصفيف الشعر + مانيكير وطلاء الأظافر + عناية بالوجه (بانتظار التأكيد)');
  });
});

describe('algiersInstant', () => {
  it('reads a salon date and time in Algiers time (UTC+1 all year)', () => {
    expect(algiersInstant('2030-07-08', '10:30').toISOString()).toBe('2030-07-08T09:30:00.000Z');
  });
});

describe('calendarFileUrl and parseCalendarRequest', () => {
  it('round-trips the date, time, services in order and language', () => {
    const url = calendarFileUrl({ date: '2030-01-08', time: '10:00', serviceIds: ['coupe-femme', '7cbf8046-182f-469d-9911-48c5d6d2ecbf'], lang: 'ar' });
    expect(url.startsWith('/calendar.ics?')).toBe(true);
    expect(parseCalendarRequest(new URL(url, 'https://x.test').searchParams)).toEqual({
      date: '2030-01-08',
      time: '10:00',
      serviceIds: ['coupe-femme', '7cbf8046-182f-469d-9911-48c5d6d2ecbf'],
      lang: 'ar',
    });
  });

  it('refuses anything that is not a real date, time and 1 to 4 service ids', () => {
    const parse = (q: string) => parseCalendarRequest(new URLSearchParams(q));
    expect(parse('d=2030-01-08&t=10:00&s=a')).toEqual({ date: '2030-01-08', time: '10:00', serviceIds: ['a'], lang: 'fr' });
    expect(parse('d=2030-02-30&t=10:00&s=a')).toBeNull();
    expect(parse('d=2030-01-08&t=24:00&s=a')).toBeNull();
    expect(parse('d=2030-01-08&t=10:00&s=')).toBeNull();
    expect(parse('d=2030-01-08&t=10:00&s=a,b,c,d,e')).toBeNull();
    expect(parse('d=2030-01-08&t=10:00&s=a)b')).toBeNull();
    expect(parse('d=2030-01-08&t=10:00&s=a&l=en')).toEqual({ date: '2030-01-08', time: '10:00', serviceIds: ['a'], lang: 'fr' });
  });
});

describe('joinAddress', () => {
  it('puts the address lines and the city on one line', () => {
    expect(joinAddress('15 rue Larbi Ben M’hidi\n31000 Oran\n', ' Oran ')).toBe('15 rue Larbi Ben M’hidi, 31000 Oran, Oran');
  });
});
