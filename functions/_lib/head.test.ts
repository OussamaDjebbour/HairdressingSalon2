// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { headTags, manifestFor, normalizeHost, toEdgeSalon, type EdgeSalon } from './head';

const ELEGANCE: EdgeSalon = {
  id: 'elegance',
  name: 'Élégance',
  palette: {
    '50': '#FBF1F3', '100': '#F7E0E5', '200': '#EFC1CC', '300': '#E29FB1', '400': '#D17D93',
    '500': '#B85F76', '600': '#9D4B5F', '700': '#7E3B4C', '800': '#5F2D3A', '900': '#421F28',
  },
};

const YASMINE: EdgeSalon = {
  id: 'yasmine',
  name: 'Salon Yasmine',
  palette: {
    '50': '#F0F5FB', '100': '#DCE8F6', '200': '#B9D1ED', '300': '#8FB4E1', '400': '#6493D2',
    '500': '#3F72BD', '600': '#2A5AA0', '700': '#21477F', '800': '#19365F', '900': '#102440',
  },
};

// The static manifest is the local-dev fallback; the edge one must match it for Élégance.
// @ts-ignore no node types in this project
const { readFileSync } = (await import('node:fs')) as { readFileSync: (p: string, e: string) => string };
const staticManifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

describe('headTags', () => {
  it("gives Élégance today's title, theme colour and brand colours", () => {
    const tags = headTags(ELEGANCE);
    expect(tags.title).toBe('Élégance — Salon de beauté');
    expect(tags.themeColor).toBe('#421F28');
    expect(tags.description).toBe('Élégance — salon de coiffure et de beauté. Réservez votre rendez-vous en ligne.');
    expect(tags.style).toContain('--brand-600:157 75 95');
  });

  it('inlines every brand shade in one :root rule', () => {
    expect(headTags(ELEGANCE).style).toBe(
      ':root{--brand-50:251 241 243;--brand-100:247 224 229;--brand-200:239 193 204;' +
        '--brand-300:226 159 177;--brand-400:209 125 147;--brand-500:184 95 118;' +
        '--brand-600:157 75 95;--brand-700:126 59 76;--brand-800:95 45 58;--brand-900:66 31 40}',
    );
  });

  it("uses another salon's own name and colours", () => {
    const tags = headTags(YASMINE);
    expect(tags.title).toBe('Salon Yasmine — Salon de beauté');
    expect(tags.themeColor).toBe('#102440');
    expect(tags.style).toContain('--brand-900:16 36 64');
  });
});

describe('manifestFor', () => {
  it("names the home-screen app after the salon, in the salon's colour", () => {
    const m = manifestFor(YASMINE);
    expect(m.short_name).toBe('Salon Yasmine');
    expect(m.name).toBe('Salon Yasmine — Espace salon');
    expect(m.theme_color).toBe('#102440');
    expect(m.background_color).toBe('#FDFBF8');
    expect(m.start_url).toBe('/admin');
    expect(m.icons).toEqual(staticManifest.icons);
  });

  it('is identical to the static manifest for Élégance', () => {
    expect(manifestFor(ELEGANCE)).toEqual(staticManifest);
  });
});

describe('toEdgeSalon', () => {
  it('keeps a well-formed salon row', () => {
    expect(toEdgeSalon({ ...ELEGANCE, extra: 1 })).toEqual(ELEGANCE);
  });

  it.each([
    ['null', null],
    ['no name', { ...ELEGANCE, name: '' }],
    ['no palette', { ...ELEGANCE, palette: null }],
    ['missing shade', { ...ELEGANCE, palette: { ...ELEGANCE.palette, '900': undefined } }],
    ['bad shade', { ...ELEGANCE, palette: { ...ELEGANCE.palette, '600': 'red;}body{x' } }],
  ])('rejects %s', (_label, row) => {
    expect(toEdgeSalon(row)).toBeNull();
  });
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
