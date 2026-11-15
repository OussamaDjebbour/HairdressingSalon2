export const CATEGORIES = ['coiffure', 'beaute', 'spa'] as const;
export type Category = (typeof CATEGORIES)[number];

export const isCategory = (x: unknown): x is Category => CATEGORIES.includes(x as Category);

/** Items grouped in the fixed category order; empty groups are dropped, items keep their order.
 *  An unknown category lands in coiffure (the database never stores one). */
export function groupByCategory<T extends { category: string }>(items: T[]): { category: Category; items: T[] }[] {
  const groups = CATEGORIES.map((category) => ({
    category,
    items: items.filter((i) => (isCategory(i.category) ? i.category : 'coiffure') === category),
  }));
  return groups.filter((g) => g.items.length > 0);
}
