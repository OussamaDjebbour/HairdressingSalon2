import { describe, expect, it } from 'vitest';
import { prefixConfigIds, salonItemId } from './ids';
import type { SalonConfig } from './config';

describe('salonItemId', () => {
  it('puts the salon id in front of a short id', () => {
    expect(salonItemId('yasmine', 'amina')).toBe('yasmine-amina');
  });
  it('leaves an id that already starts with the salon id', () => {
    expect(salonItemId('yasmine', 'yasmine-amina')).toBe('yasmine-amina');
  });
  it('doesn’t take a longer salon id for its own prefix', () => {
    expect(salonItemId('yasmine', 'yasmine2-amina')).toBe('yasmine-yasmine2-amina');
  });
  it('keeps an id this salon already uses (launched before the prefix existed)', () => {
    expect(salonItemId('yasmine', 'amina', new Set(['amina']))).toBe('amina');
  });
});

describe('prefixConfigIds', () => {
  const config = {
    id: 'yasmine',
    categories: [{ id: 'mariee', name: { fr: 'Mariée' } }],
    services: [
      { id: 'coupe', category: 'coiffure', name: { fr: 'Coupe' }, price: 1000, duration: 30 },
      { id: 'essai', category: 'custom:mariee', name: { fr: 'Essai' }, price: 5000, duration: 60 },
    ],
    stylists: [{ id: 'amina', name: 'Amina', services: ['coupe', 'essai'] }],
  } as unknown as SalonConfig;

  it('prefixes every service, stylist and category id, and every reference to them', () => {
    const out = prefixConfigIds(config);
    expect(out.categories!.map((c) => c.id)).toEqual(['yasmine-mariee']);
    expect(out.services.map((s) => [s.id, s.category])).toEqual([
      ['yasmine-coupe', 'coiffure'],
      ['yasmine-essai', 'custom:yasmine-mariee'],
    ]);
    expect(out.stylists.map((s) => [s.id, s.services])).toEqual([['yasmine-amina', ['yasmine-coupe', 'yasmine-essai']]]);
  });

  it('keeps the ids this salon already has, in the items and the references', () => {
    const out = prefixConfigIds(config, new Set(['coupe', 'amina']));
    expect(out.services.map((s) => s.id)).toEqual(['coupe', 'yasmine-essai']);
    expect(out.stylists[0].id).toBe('amina');
    expect(out.stylists[0].services).toEqual(['coupe', 'yasmine-essai']);
  });

  it('leaves the file it was given untouched', () => {
    prefixConfigIds(config);
    expect(config.services[0].id).toBe('coupe');
  });
});
