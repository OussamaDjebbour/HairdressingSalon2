// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from './manifest.webmanifest';
import { lookupSalon } from './_lib/lookup';

vi.mock('./_lib/lookup', () => ({ lookupSalon: vi.fn() }));
const lookup = vi.mocked(lookupSalon);

const ENV = { SUPABASE_URL: 'https://db.example.co', SUPABASE_PUBLISHABLE_KEY: 'k' };
const YASMINE = {
  id: 'yasmine',
  name: 'Salon Yasmine',
  palette: {
    '50': '#F0F5FB', '100': '#DCE8F6', '200': '#B9D1ED', '300': '#8FB4E1', '400': '#6493D2',
    '500': '#3F72BD', '600': '#2A5AA0', '700': '#21477F', '800': '#19365F', '900': '#102440',
  },
};

function get(url: string) {
  const context = { request: new Request(url), env: ENV, next: vi.fn() };
  return onRequestGet(context as unknown as Parameters<typeof onRequestGet>[0]);
}

beforeEach(() => {
  lookup.mockReset();
});

describe('/manifest.webmanifest at the edge', () => {
  it("serves the salon's own home-screen app manifest", async () => {
    lookup.mockResolvedValue(YASMINE);

    const res = await get('https://www.salon-yasmine.com/manifest.webmanifest');

    expect(lookup).toHaveBeenCalledWith('salon-yasmine.com', ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/manifest+json; charset=utf-8');
    const body = (await res.json()) as { short_name: string; theme_color: string };
    expect(body.short_name).toBe('Salon Yasmine');
    expect(body.theme_color).toBe('#102440');
  });

  it('is 404 for an unknown host (never another salon)', async () => {
    lookup.mockResolvedValue(null);
    expect((await get('https://nobody.com/manifest.webmanifest')).status).toBe(404);
  });

  it('is 503 when the lookup fails (never the default salon)', async () => {
    lookup.mockRejectedValue(new Error('db down'));
    const res = await get('https://salon-yasmine.com/manifest.webmanifest');
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
