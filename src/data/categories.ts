/** Display order. Packs come first. */
export const CATEGORIES = ['pack', 'coiffure', 'beaute', 'spa'] as const;
export type Category = (typeof CATEGORIES)[number];

/** What the service form offers: a pack has its own form. */
export const SERVICE_FORM_CATEGORIES = ['coiffure', 'beaute', 'spa'] as const;
export type ServiceFormCategory = (typeof SERVICE_FORM_CATEGORIES)[number];

export const isServiceFormCategory = (x: unknown): x is ServiceFormCategory =>
  SERVICE_FORM_CATEGORIES.includes(x as ServiceFormCategory);

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
