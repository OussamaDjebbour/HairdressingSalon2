// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupSalon } from './lookup';

const ENV = { SUPABASE_URL: 'https://db.example.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' };
const PALETTE = {
  '50': '#FBF1F3', '100': '#F7E0E5', '200': '#EFC1CC', '300': '#E29FB1', '400': '#D17D93',
  '500': '#B85F76', '600': '#9D4B5F', '700': '#7E3B4C', '800': '#5F2D3A', '900': '#421F28',
};
const SARA_ROW = { id: 'sara', name: 'Sara Beauté', palette: PALETTE, hero_image: 'https://x/hero.jpg', demo: false };
const SARA = { id: 'sara', name: 'Sara Beauté', palette: PALETTE, row: SARA_ROW };

/** In-memory stand-in for the Workers Cache API (`caches.default`). */
function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => {
      store.set(req.url, res.clone());
    }),
  };
}

let cache: ReturnType<typeof fakeCache>;
let fetchMock: ReturnType<typeof vi.fn>;

function rest(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  cache = fakeCache();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('caches', { default: cache });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupSalon', () => {
  it('asks salon_domains for the host with the publishable key', async () => {
    rest([{ salon: SARA_ROW }]);

    // The whole row is kept: the middleware writes it into the page for the app.
    expect(await lookupSalon('sara-salon.com', ENV)).toEqual(SARA);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://db.example.co/rest/v1/salon_domains?domain=eq.sara-salon.com&select=salon:salons(' +
        'id,name,name_ar,palette,hero_image,founder_name,founder_role,story,story_intro,' +
        'years_open,client_count,rating,review_count,demo)',
    );
    expect(new Headers(init.headers).get('apikey')).toBe('sb_publishable_x');
  });

  it('answers from the cache for 5 minutes', async () => {
    rest([{ salon: SARA_ROW }]);

    await lookupSalon('sara-salon.com', ENV);
    expect(await lookupSalon('sara-salon.com', ENV)).toEqual(SARA);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // v2 key: a v1 entry (no row) is never read back.
    expect([...cache.store.keys()]).toEqual(['https://sara-salon.com/__salon-lookup-v2']);
    const cached = [...cache.store.values()][0];
    expect(cached.headers.get('Cache-Control')).toBe('max-age=300');
  });

  it('caches "not found" too', async () => {
    rest([]);

    expect(await lookupSalon('nobody.com', ENV)).toBeNull();
    expect(await lookupSalon('nobody.com', ENV)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps hosts apart in the cache', async () => {
    rest([{ salon: SARA_ROW }]);
    rest([]);

    expect(await lookupSalon('sara-salon.com', ENV)).toEqual(SARA);
    expect(await lookupSalon('other.com', ENV)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on a database error and does not cache it', async () => {
    rest({ message: 'boom' }, 500);
    await expect(lookupSalon('sara-salon.com', ENV)).rejects.toThrow();
    expect(cache.put).not.toHaveBeenCalled();

    rest([{ salon: SARA_ROW }]);
    expect(await lookupSalon('sara-salon.com', ENV)).toEqual(SARA);
  });

  it('throws on a malformed salon (never serves broken colours)', async () => {
    rest([{ salon: { ...SARA_ROW, palette: { ...PALETTE, '600': 'nope' } } }]);
    await expect(lookupSalon('sara-salon.com', ENV)).rejects.toThrow();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('throws when the Supabase settings are missing', async () => {
    await expect(lookupSalon('sara-salon.com', { SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still answers when the cache fails to read or write', async () => {
    cache.match.mockRejectedValue(new Error('cache down'));
    cache.put.mockRejectedValue(new Error('cache down'));
    rest([{ salon: SARA_ROW }]);
    expect(await lookupSalon('sara-salon.com', ENV)).toEqual(SARA);
  });

  it('writes the cache in the background when it can (waitUntil)', async () => {
    rest([{ salon: SARA_ROW }]);
    const waitUntil = vi.fn();
    expect(await lookupSalon('sara-salon.com', ENV, waitUntil)).toEqual(SARA);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(cache.store.size).toBe(1);
  });

  it('a failing background cache write is swallowed', async () => {
    cache.put.mockRejectedValue(new Error('cache down'));
    rest([{ salon: SARA_ROW }]);
    const waitUntil = vi.fn();
    expect(await lookupSalon('sara-salon.com', ENV, waitUntil)).toEqual(SARA);
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it('still works without the Cache API', async () => {
    vi.stubGlobal('caches', undefined);
    rest([{ salon: SARA_ROW }]);
    expect(await lookupSalon('sara-salon.com', ENV)).toEqual(SARA);
  });
});
