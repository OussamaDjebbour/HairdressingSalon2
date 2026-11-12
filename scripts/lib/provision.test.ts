// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generatePalette } from '../../src/lib/palette';
import { parseSalonConfig, type SalonConfig } from './config';
import { buildProvisionPayload, localPhotos, storagePath } from './provision';

const exampleJson = () =>
  JSON.parse(readFileSync(new URL('../../salons/example.json', import.meta.url), 'utf8'));
const example = (): SalonConfig => parseSalonConfig(exampleJson());
const { palette } = generatePalette('#2F6F73');
const OWNER = '00000000-0000-4000-8000-000000000001';

describe('buildProvisionPayload', () => {
  it('maps hours Monday..Sunday to weekdays 1..7, null for "closed"', () => {
    const p = buildProvisionPayload(example(), palette, {});
    expect(p.hours).toEqual([
      { weekday: 1, opens: null, closes: null },
      { weekday: 2, opens: '09:00', closes: '18:00' },
      { weekday: 3, opens: '09:00', closes: '18:00' },
      { weekday: 4, opens: '09:00', closes: '18:00' },
      { weekday: 5, opens: '13:00', closes: '18:00' },
      { weekday: 6, opens: '09:00', closes: '18:00' },
      { weekday: 7, opens: null, closes: null },
    ]);
  });

  it('normalises and de-duplicates domains', () => {
    const json = exampleJson();
    json.domains = ['WWW.Sara-Salon.com', 'sara-salon.com.', 'rdv.sara-salon.com'];
    const p = buildProvisionPayload(parseSalonConfig(json), palette, {});
    expect(p.domains).toEqual(['sara-salon.com', 'rdv.sara-salon.com']);
  });

  it('defaults a missing Arabic text to the French one', () => {
    const p = buildProvisionPayload(example(), palette, {});
    const lina = p.stylists.find((s) => s.id === 'example-lina')!;
    expect(lina.role).toEqual({ fr: 'Esthéticienne', ar: 'Esthéticienne' });
    expect(p.founder_name).toEqual({ fr: 'Sara', ar: 'سارة' });
  });

  it('uses the flat provision_salon keys', () => {
    const p = buildProvisionPayload(example(), palette, {}, OWNER);
    expect(p).toMatchObject({
      id: 'example',
      name: 'Salon Exemple',
      name_ar: 'صالون المثال',
      palette,
      founder_role: { fr: 'Fondatrice & coiffeuse', ar: 'المؤسِّسة وخبيرة التصفيف' },
      story_intro: { fr: expect.stringMatching(/^Depuis trois ans/) },
      years_open: 3,
      client_count: 400,
      rating: 4.7,
      review_count: 52,
      whatsapp: '+213 555 12 34 56',
      instagram_url: 'https://instagram.com/salon.exemple',
      owner_user_id: OWNER,
    });
    expect(p.hero_image).toMatch(/^https:\/\/images\.pexels\.com\//);
    expect(p.services[0]).toEqual({
      id: 'example-coupe',
      category: 'coiffure',
      name: { fr: 'Coupe & brushing', ar: 'قص وتصفيف' },
      description: { fr: 'Coupe sur mesure et brushing.', ar: 'قصّة حسب الطلب مع تصفيف.' },
      price: 2500,
      duration: 60,
      image: expect.stringMatching(/^https:\/\//),
    });
    expect(p.stylists[0]).toMatchObject({ services: ['example-coupe', 'example-couleur'], weekdays: [2, 3, 4, 6] });
  });

  it('leaves out what the config leaves out, so the owner keeps her edits', () => {
    const json = exampleJson();
    delete json.story;
    delete json.claims;
    delete json.instagram;
    delete json.founder;
    const p = buildProvisionPayload(parseSalonConfig(json), palette, {});
    for (const key of ['story', 'founder_name', 'founder_role', 'years_open', 'rating', 'instagram_url', 'facebook_url', 'owner_user_id']) {
      expect(p).not.toHaveProperty(key);
    }
    const couleur = p.services.find((s) => s.id === 'example-couleur')!;
    expect(couleur).not.toHaveProperty('description');
    expect(couleur).not.toHaveProperty('image');
    expect(p.stylists.find((s) => s.id === 'example-lina')).not.toHaveProperty('weekdays');
  });

  it('clears the Arabic name when the config has none (the site then uses the French name)', () => {
    const json = exampleJson();
    json.name = { fr: 'Salon Sara' };
    expect(buildProvisionPayload(parseSalonConfig(json), palette, {}).name_ar).toBe('');
  });

  it('uses the uploaded URL of local photos', () => {
    const json = exampleJson();
    json.heroPhoto = 'hero.jpg';
    json.stylists[1].photo = 'lina.jpg';
    const urls = { 'hero.jpg': 'https://db.example.co/hero', 'lina.jpg': 'https://db.example.co/lina' };
    const p = buildProvisionPayload(parseSalonConfig(json), palette, urls);
    expect(p.hero_image).toBe('https://db.example.co/hero');
    expect(p.stylists[1].image).toBe('https://db.example.co/lina');
  });

  it('throws when a local photo has no uploaded URL', () => {
    const json = { ...exampleJson(), heroPhoto: 'hero.jpg' };
    expect(() => buildProvisionPayload(parseSalonConfig(json), palette, {})).toThrow(/hero\.jpg/);
  });
});

describe('photos', () => {
  it('lists local photos once each, ignoring https URLs', () => {
    const json = exampleJson();
    json.heroPhoto = 'hero.jpg';
    json.services[1].photo = 'couleur.jpg';
    json.stylists[1].photo = 'hero.jpg';
    expect(localPhotos(parseSalonConfig(json))).toEqual(['hero.jpg', 'couleur.jpg']);
  });

  it('stores a photo under the salon id', () => {
    expect(storagePath('sara', 'team/lina.jpg')).toBe('sara/team/lina.jpg');
  });
});
