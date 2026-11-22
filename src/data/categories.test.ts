import { describe, it, expect } from 'vitest';
import { CATEGORIES, SERVICE_FORM_CATEGORIES, categoryOf, groupByCategory, isCategory, largestGroup } from './categories';

describe('categories', () => {
  it('lists the categories in display order, packs first; the service form never offers pack', () => {
    expect([...CATEGORIES]).toEqual(['pack', 'coiffure', 'beaute', 'spa']);
    expect([...SERVICE_FORM_CATEGORIES]).toEqual(['coiffure', 'beaute', 'spa']);
  });

  it('isCategory accepts only known categories', () => {
    expect(isCategory('spa')).toBe(true);
    expect(isCategory('massage')).toBe(false);
    expect(isCategory(undefined)).toBe(false);
  });

  it('groups in the fixed order, drops empty groups and keeps the incoming order inside a group', () => {
    const items = [
      { id: 'a', category: 'spa' }, { id: 'b', category: 'coiffure' },
      { id: 'c', category: 'spa' }, { id: 'd', category: 'beaute' }, { id: 'e', category: 'coiffure' },
    ];
    expect(groupByCategory(items).map((g) => [g.category, g.items.map((i) => i.id)])).toEqual([
      ['coiffure', ['b', 'e']], ['beaute', ['d']], ['spa', ['a', 'c']],
    ]);
    expect(groupByCategory(items.filter((i) => i.category === 'spa')).map((g) => g.category)).toEqual(['spa']);
    expect(groupByCategory([])).toEqual([]);
  });

  it('groupByCategory puts packs first', () => {
    const items = [{ id: 'a', category: 'coiffure' }, { id: 'p', category: 'pack' }];
    expect(groupByCategory(items).map((g) => g.category)).toEqual(['pack', 'coiffure']);
  });

  it('puts an unknown category under coiffure', () => {
    expect(groupByCategory([{ id: 'x', category: 'hair' }])).toEqual([{ category: 'coiffure', items: [{ id: 'x', category: 'hair' }] }]);
  });
});

describe('largestGroup', () => {
  const g = (category: (typeof CATEGORIES)[number], n: number) => ({ category, items: Array.from({ length: n }, (_, i) => i) });

  it('is the group with the most items', () => {
    expect(largestGroup([g('pack', 1), g('coiffure', 2), g('beaute', 5), g('spa', 3)])?.category).toBe('beaute');
  });

  it('breaks ties in display order', () => {
    expect(largestGroup([g('pack', 2), g('coiffure', 2), g('beaute', 1)])?.category).toBe('pack');
    expect(largestGroup([g('pack', 1), g('coiffure', 3), g('spa', 3)])?.category).toBe('coiffure');
  });

  it('is undefined with no groups', () => {
    expect(largestGroup([])).toBeUndefined();
  });
});

describe('categoryOf', () => {
  it('keeps a known category and counts an unknown one as coiffure', () => {
    expect(categoryOf({ category: 'spa' })).toBe('spa');
    expect(categoryOf({ category: 'hair' })).toBe('coiffure');
  });
});
