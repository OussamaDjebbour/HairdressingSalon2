import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import { supabase } from '../lib/supabase';
import { normalizeHost, resolveSalon } from './currentSalon';
import { currentSalonId, setCurrentSalon, useSalon } from './salon';
import { ELEGANCE } from '../test/salon';

const SARA_ROW = {
  id: 'sara',
  name: 'Sara Beauté',
  name_ar: 'سارة بيوتي',
  palette: {
    '50': '#F0F4FF', '100': '#E0E8FF', '200': '#C2D1FF', '300': '#A3BAFF', '400': '#85A3FF',
    '500': '#668CFF', '600': '#3355CC', '700': '#264099', '800': '#1A2B66', '900': '#0D1533',
  },
  hero_image: 'https://example.com/sara.jpg',
  founder_name: { fr: 'Sara', ar: 'سارة' },
  founder_role: { fr: 'Fondatrice', ar: 'المؤسِّسة' },
  story: { fr: 'Citation', ar: 'اقتباس' },
  story_intro: { fr: 'Intro', ar: 'مقدمة' },
  years_open: 3,
  client_count: 400,
  rating: 4.7,
  review_count: 52,
};

const SARA = {
  id: 'sara',
  name: { fr: 'Sara Beauté', ar: 'سارة بيوتي' },
  palette: SARA_ROW.palette,
  heroImage: 'https://example.com/sara.jpg',
  founderName: { fr: 'Sara', ar: 'سارة' },
  founderRole: { fr: 'Fondatrice', ar: 'المؤسِّسة' },
  story: { fr: 'Citation', ar: 'اقتباس' },
  storyIntro: { fr: 'Intro', ar: 'مقدمة' },
  yearsOpen: 3,
  clientCount: 400,
  rating: 4.7,
  reviewCount: 52,
};

// A chainable query builder: records the table, the select, every .eq(), resolves on .maybeSingle().
const calls: { table: string; select: string; eq: unknown[][] }[] = [];
function respond(data: unknown, error: unknown = null) {
  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    const call = { table, select: '', eq: [] as unknown[][] };
    calls.push(call);
    const b = {
      select: (s: string) => ((call.select = s), b),
      eq: (...args: unknown[]) => (call.eq.push(args), b),
      maybeSingle: () => Promise.resolve({ data, error }),
    };
    return b;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  vi.stubEnv('VITE_SALON_ID', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setCurrentSalon(ELEGANCE);
});

describe('normalizeHost (same rules and cases as private.normalize_host)', () => {
  it.each([
    ['WWW.Sara-Salon.com.:443', 'sara-salon.com'],
    ['  localhost:5173 ', 'localhost'],
    ['127.0.0.1', '127.0.0.1'],
    ['127.0.0.1:5173', '127.0.0.1'],
    ['sara-salon.com', 'sara-salon.com'],
    ['www.sara-salon.com', 'sara-salon.com'],
    ['sara-salon.com..', 'sara-salon.com'],
    ['sara-salon.com:', 'sara-salon.com'],
    ['www.www.sara-salon.com', 'www.sara-salon.com'],
    ['wwwsara.com', 'wwwsara.com'],
    ['', ''],
  ])('%j -> %j', (host, expected) => {
    expect(normalizeHost(host)).toBe(expected);
  });
});

describe('resolveSalon', () => {
  it('looks the normalised host up in salon_domains and maps the salon', async () => {
    respond({ salon: SARA_ROW });

    const salon = await resolveSalon('WWW.Sara-Salon.com', '');

    expect(salon).toEqual(SARA);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('salon_domains');
    expect(calls[0].select).toMatch(/^salon:salons\(/);
    expect(calls[0].eq).toEqual([['domain', 'sara-salon.com']]);
  });

  it('uses the French name in Arabic when there is no Arabic name, and keeps empty claims null', async () => {
    respond({
      salon: {
        ...SARA_ROW, name_ar: null, founder_name: null, founder_role: null, story: null, story_intro: null,
        years_open: null, client_count: null, rating: null, review_count: null,
      },
    });

    const salon = await resolveSalon('sara-salon.com', '');

    expect(salon).toEqual({
      ...SARA, name: { fr: 'Sara Beauté', ar: 'Sara Beauté' },
      founderName: null, founderRole: null, story: null, storyIntro: null,
      yearsOpen: null, clientCount: null, rating: null, reviewCount: null,
    });
  });

  it('returns null for an unknown host (never another salon)', async () => {
    respond(null);

    expect(await resolveSalon('unknown-salon.com', '')).toBeNull();
    expect(calls[0].eq).toEqual([['domain', 'unknown-salon.com']]);
  });

  it('ignores ?salon= on a real domain', async () => {
    respond(null);

    expect(await resolveSalon('evil.com', '?salon=elegance')).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('salon_domains');
    expect(calls[0].eq).toEqual([['domain', 'evil.com']]);
  });

  it('ignores ?salon= on a host that merely starts with localhost', async () => {
    respond(null);

    await resolveSalon('localhost.evil.com', '?salon=sara');

    expect(calls[0].table).toBe('salon_domains');
    expect(calls[0].eq).toEqual([['domain', 'localhost.evil.com']]);
  });

  it('honours ?salon= on localhost', async () => {
    respond(SARA_ROW);

    expect(await resolveSalon('localhost:5173', '?salon=sara')).toEqual(SARA);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('salons');
    expect(calls[0].eq).toEqual([['id', 'sara']]);
  });

  it('honours ?salon= on 127.0.0.1', async () => {
    respond(SARA_ROW);

    expect(await resolveSalon('127.0.0.1:4173', '?lang=ar&salon=sara')).toEqual(SARA);
    expect(calls[0].table).toBe('salons');
    expect(calls[0].eq).toEqual([['id', 'sara']]);
  });

  it('returns null for an unknown ?salon= id on localhost', async () => {
    respond(null);

    expect(await resolveSalon('localhost:5173', '?salon=nope')).toBeNull();
  });

  it('falls back to the domain lookup when ?salon= is empty', async () => {
    respond({ salon: SARA_ROW });

    await resolveSalon('localhost:5173', '?salon=');

    expect(calls[0].table).toBe('salon_domains');
    expect(calls[0].eq).toEqual([['domain', 'localhost']]);
  });

  it('uses VITE_SALON_ID first in development', async () => {
    vi.stubEnv('VITE_SALON_ID', 'sara');
    respond(SARA_ROW);

    expect(await resolveSalon('192.168.1.20:5173', '?salon=elegance')).toEqual(SARA);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('salons');
    expect(calls[0].eq).toEqual([['id', 'sara']]);
  });

  it('ignores VITE_SALON_ID in a production build', async () => {
    vi.stubEnv('VITE_SALON_ID', 'sara');
    vi.stubEnv('DEV', false);
    respond(null);

    expect(await resolveSalon('evil.com', '')).toBeNull();
    expect(calls[0].table).toBe('salon_domains');
    expect(calls[0].eq).toEqual([['domain', 'evil.com']]);
  });

  it('throws on a network or database error (so the app can offer a retry)', async () => {
    respond(null, { message: 'Failed to fetch' });

    await expect(resolveSalon('sara-salon.com', '')).rejects.toBeTruthy();
  });
});

describe('the current salon store', () => {
  it('currentSalonId() throws before a salon is set', () => {
    setCurrentSalon(null);
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs the render error
    expect(() => currentSalonId()).toThrow();
    expect(() => renderHook(() => useSalon())).toThrow();
  });

  it('returns the salon once set', () => {
    setCurrentSalon(SARA);
    expect(currentSalonId()).toBe('sara');
    expect(renderHook(() => useSalon()).result.current).toEqual(SARA);
  });

  it('is Élégance in tests by default (set in src/test/setup.ts)', () => {
    expect(currentSalonId()).toBe('elegance');
  });
});
