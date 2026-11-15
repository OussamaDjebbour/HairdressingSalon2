import { describe, it, expect } from 'vitest';
import { CATEGORIES, groupByCategory, isCategory } from './categories';

describe('categories', () => {
  it('lists the three categories in display order', () => {
    expect([...CATEGORIES]).toEqual(['coiffure', 'beaute', 'spa']);
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

  it('puts an unknown category under coiffure', () => {
    expect(groupByCategory([{ id: 'x', category: 'hair' }])).toEqual([{ category: 'coiffure', items: [{ id: 'x', category: 'hair' }] }]);
  });
});
