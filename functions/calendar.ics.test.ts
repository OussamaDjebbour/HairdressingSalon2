// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './calendar.ics';
import { lookupSalon } from './_lib/lookup';

vi.mock('./_lib/lookup', () => ({ lookupSalon: vi.fn() }));
const lookup = vi.mocked(lookupSalon);

const ENV = { SUPABASE_URL: 'https://db.example.co', SUPABASE_PUBLISHABLE_KEY: 'k' };
const YASMINE = { id: 'yasmine', name: 'Salon Yasmine', palette: {} as never, row: {} };

const SERVICES = [
  { id: 'y-coupe', name: { fr: 'Coupe', ar: 'قص' }, duration: 60 },
  { id: 'y-ongles', name: { fr: 'Manucure', ar: 'مانيكير' }, duration: 45 },
];
const SALON_ROW = { address: { fr: '15 rue Larbi Ben M’hidi\n31000 Oran', ar: '15 شارع العربي بن مهيدي' }, city: { fr: 'Oran', ar: 'وهران' } };

let fetchMock: ReturnType<typeof vi.fn>;

function get(url: string) {
  const context = { request: new Request(url), env: ENV, next: vi.fn(), waitUntil: vi.fn() };
  return onRequestGet(context as unknown as Parameters<typeof onRequestGet>[0]);
}

beforeEach(() => {
  lookup.mockReset();
  fetchMock = vi.fn(async (input: string) => {
    const url = String(input);
    if (url.includes('/rest/v1/services')) return new Response(JSON.stringify(SERVICES));
    if (url.includes('/rest/v1/salons')) return new Response(JSON.stringify([SALON_ROW]));
    return new Response('[]', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('/calendar.ics at the edge', () => {
  it("serves the visit as a calendar file built from the salon's own data", async () => {
    lookup.mockResolvedValue(YASMINE);

    const res = await get('https://www.salon-yasmine.com/calendar.ics?d=2030-01-08&t=10:00&s=y-ongles,y-coupe&l=fr');

    expect(lookup).toHaveBeenCalledWith('salon-yasmine.com', ENV, expect.any(Function));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="rendez-vous.ics"');
    const body = (await res.text()).replace(/\r\n /g, '');
    // In the order she booked, back to back: 10:00 Algiers = 09:00 UTC, 45 + 60 minutes.
    expect(body).toContain('SUMMARY:Salon Yasmine — Manucure + Coupe (à confirmer)');
    expect(body).toContain('DTSTART:20300108T090000Z');
    expect(body).toContain('DTEND:20300108T104500Z');
    expect(body).toContain('LOCATION:15 rue Larbi Ben M’hidi\\, 31000 Oran\r');
    expect(body).toContain('TRIGGER:-P1D');
  });

  it("reads only this salon's services and row", async () => {
    lookup.mockResolvedValue(YASMINE);
    await get('https://salon-yasmine.com/calendar.ics?d=2030-01-08&t=10:00&s=y-coupe');
    const urls = fetchMock.mock.calls.map((c) => decodeURIComponent(String(c[0])));
    expect(urls.find((u) => u.includes('/services'))).toContain('salon_id=eq.yasmine');
    expect(urls.find((u) => u.includes('/services'))).toContain('id=in.(y-coupe)');
    expect(urls.find((u) => u.includes('/salons'))).toContain('id=eq.yasmine');
  });

  it('writes the event in Arabic when asked', async () => {
    lookup.mockResolvedValue(YASMINE);
    const body = (await (await get('https://salon-yasmine.com/calendar.ics?d=2030-01-08&t=10:00&s=y-coupe&l=ar')).text()).replace(/\r\n /g, '');
    expect(body).toContain('SUMMARY:Salon Yasmine — قص (بانتظار التأكيد)');
    expect(body).toContain('LOCATION:15 شارع العربي بن مهيدي\\, وهران');
  });

  it('is 400 for anything but a real date, time and service list, without asking the database', async () => {
    expect((await get('https://salon-yasmine.com/calendar.ics?d=2030-02-30&t=10:00&s=y-coupe')).status).toBe(400);
    expect((await get('https://salon-yasmine.com/calendar.ics?d=2030-01-08&t=10:00&s=a)b')).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('is 404 for an unknown host (never another salon)', async () => {
    lookup.mockResolvedValue(null);
    expect((await get('https://nobody.com/calendar.ics?d=2030-01-08&t=10:00&s=y-coupe')).status).toBe(404);
  });

  it("is 404 when a service is not this salon's", async () => {
    lookup.mockResolvedValue(YASMINE);
    expect((await get('https://salon-yasmine.com/calendar.ics?d=2030-01-08&t=10:00&s=y-coupe,other-salon-cut')).status).toBe(404);
  });

  it('is 503 when the lookup or the database fails', async () => {
    lookup.mockRejectedValue(new Error('db down'));
    expect((await get('https://salon-yasmine.com/calendar.ics?d=2030-01-08&t=10:00&s=y-coupe')).status).toBe(503);
    lookup.mockResolvedValue(YASMINE);
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    expect((await get('https://salon-yasmine.com/calendar.ics?d=2030-01-08&t=10:00&s=y-coupe')).status).toBe(503);
  });
});
