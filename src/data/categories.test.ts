import { describe, it, expect } from 'vitest';
import { CATEGORIES, SERVICE_FORM_CATEGORIES, categoryKeyOf, categoryLabel, groupServices, largestGroup, type CategoryKey, type CustomCategory } from './categories';

const custom = (id: string, sortOrder: number, fr = id, ar = id): CustomCategory => ({ id, sortOrder, name: { fr, ar } });
const svc = (id: string, category: string, customCategoryId: string | null = null) => ({ id, category, customCategoryId });

describe('categories', () => {
  it('lists the ready-made categories in display order; the service form never offers pack', () => {
    expect([...CATEGORIES]).toEqual(['pack', 'coiffure', 'capillaire', 'visage', 'regard', 'ongles', 'epilation', 'maquillage', 'beaute', 'spa', 'massage']);
    expect([...SERVICE_FORM_CATEGORIES]).toEqual(CATEGORIES.filter((c) => c !== 'pack'));
  });

  it('groups ready-made first, then owner categories by sortOrder; drops empty groups', () => {
    const items = [svc('a', 'custom', 'c5'), svc('b', 'ongles'), svc('c', 'custom', 'c2'), svc('d', 'coiffure'), svc('e', 'ongles')];
    const groups = groupServices(items, [custom('c5', 5), custom('c2', 2), custom('c9', 9)]);
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['coiffure', ['d']], ['ongles', ['b', 'e']], ['custom:c2', ['c']], ['custom:c5', ['a']],
    ]);
    expect(groupServices([], [])).toEqual([]);
  });

  it('breaks owner sortOrder ties by id', () => {
    const items = [svc('a', 'custom', 'cb'), svc('b', 'custom', 'ca')];
    expect(groupServices(items, [custom('cb', 1), custom('ca', 1)]).map((g) => g.key)).toEqual(['custom:ca', 'custom:cb']);
  });

  it('puts packs first', () => {
    expect(groupServices([svc('a', 'coiffure'), svc('p', 'pack')], []).map((g) => g.key)).toEqual(['pack', 'coiffure']);
  });

  it('groupServices puts a service of an unknown owner category under coiffure', () => {
    expect(groupServices([svc('x', 'custom', 'gone')], [custom('c1', 1)]).map((g) => g.key)).toEqual(['coiffure']);
    expect(groupServices([svc('y', 'custom', null)], []).map((g) => g.key)).toEqual(['coiffure']);
  });

  it('puts an unknown ready-made key under coiffure', () => {
    expect(groupServices([svc('x', 'hair')], []).map((g) => g.key)).toEqual(['coiffure']);
  });

  it('an owner category named like a ready-made one is its own group', () => {
    const groups = groupServices([svc('a', 'ongles'), svc('b', 'custom', 'c1')], [custom('c1', 1, 'Ongles', 'أظافر')]);
    expect(groups.map((g) => g.key)).toEqual(['ongles', 'custom:c1']);
  });

  it('categoryKeyOf resolves a service', () => {
    expect(categoryKeyOf(svc('a', 'spa'), [])).toBe('spa');
    expect(categoryKeyOf(svc('a', 'custom', 'c1'), [custom('c1', 1)])).toBe('custom:c1');
    expect(categoryKeyOf(svc('a', 'custom', 'zz'), [])).toBe('coiffure');
  });
});

describe('categoryLabel', () => {
  const t = (k: string) => `T(${k})`;
  const cs = [custom('c1', 1, 'Mariée', 'عروس')];
  it('translates a ready-made key, names an owner one, falls back to coiffure', () => {
    expect(categoryLabel('ongles', cs, t, 'fr')).toBe('T(category.ongles)');
    expect(categoryLabel('custom:c1', cs, t, 'ar')).toBe('عروس');
    expect(categoryLabel('custom:c1', cs, t, 'fr')).toBe('Mariée');
    expect(categoryLabel('custom:x', cs, t, 'fr')).toBe('T(category.coiffure)');
  });
});

describe('largestGroup', () => {
  const g = (key: CategoryKey, n: number) => ({ key, items: Array.from({ length: n }, (_, i) => i) });

  it('is the group with the most items', () => {
    expect(largestGroup([g('pack', 1), g('coiffure', 2), g('beaute', 5), g('spa', 3)])?.key).toBe('beaute');
  });

  it('breaks ties in display order', () => {
    expect(largestGroup([g('pack', 2), g('coiffure', 2), g('beaute', 1)])?.key).toBe('pack');
    expect(largestGroup([g('pack', 1), g('coiffure', 3), g('spa', 3)])?.key).toBe('coiffure');
  });

  it('is undefined with no groups', () => {
    expect(largestGroup([])).toBeUndefined();
  });
});
