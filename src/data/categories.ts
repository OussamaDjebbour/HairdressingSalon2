import type { Lang } from '../context/LanguageContext';

/** Ready-made categories, in display order. Packs come first. */
export const CATEGORIES = ['pack', 'coiffure', 'capillaire', 'visage', 'regard', 'ongles', 'epilation', 'maquillage', 'beaute', 'spa', 'massage'] as const;
export type Category = (typeof CATEGORIES)[number];
/** What `services.category` stores: a ready-made key, or `custom` (then `custom_category_id` names the owner's). */
export type StoredCategory = Category | 'custom';

/** What the service form offers: a pack has its own form. */
export const SERVICE_FORM_CATEGORIES: readonly Exclude<Category, 'pack'>[] = CATEGORIES.filter(
  (c): c is Exclude<Category, 'pack'> => c !== 'pack',
);
export type ServiceFormCategory = (typeof SERVICE_FORM_CATEGORIES)[number];

export const isServiceFormCategory = (x: unknown): x is ServiceFormCategory =>
  SERVICE_FORM_CATEGORIES.includes(x as ServiceFormCategory);

export const isCategory = (x: unknown): x is Category => CATEGORIES.includes(x as Category);

/** A group key: a ready-made category, or `custom:<id>` for one the salon owner made. */
export type CategoryKey = Category | `custom:${string}`;

export interface CustomCategory {
  id: string;
  name: Record<Lang, string>;
  sortOrder: number;
}

type Categorised = { category: string; customCategoryId: string | null };

/** A service's group key. An unknown ready-made key, or an owner category that isn't in `custom`, counts as
 *  coiffure (the database never stores one). */
export function categoryKeyOf(s: Categorised, custom: CustomCategory[]): CategoryKey {
  if (s.category === 'custom') {
    return s.customCategoryId && custom.some((c) => c.id === s.customCategoryId) ? `custom:${s.customCategoryId}` : 'coiffure';
  }
  return isCategory(s.category) ? s.category : 'coiffure';
}

/** Items grouped: ready-made categories in their fixed order, then the owner's by (sortOrder, id). Empty groups
 *  are dropped, items keep their order. */
export function groupServices<T extends Categorised>(items: T[], custom: CustomCategory[]): { key: CategoryKey; items: T[] }[] {
  const keys: CategoryKey[] = [
    ...CATEGORIES,
    ...[...custom].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((c) => `custom:${c.id}` as const),
  ];
  const keyed = items.map((item) => ({ item, key: categoryKeyOf(item, custom) }));
  return keys
    .map((key) => ({ key, items: keyed.filter((k) => k.key === key).map((k) => k.item) }))
    .filter((g) => g.items.length > 0);
}

/** The text of a group key: translated for a ready-made one, the owner's own name for hers. */
export function categoryLabel(key: CategoryKey, custom: CustomCategory[], t: (k: string) => string, lang: Lang): string {
  if (key.startsWith('custom:')) {
    const c = custom.find((x) => x.id === key.slice('custom:'.length));
    return c ? c.name[lang] || c.name.fr : t('category.coiffure');
  }
  return t(`category.${key}`);
}

/** The group shown first under tabs: the one with the most items (what the salon mostly does), ties in display
 *  order. Packs keep their first tab but don't open the list: one pack alone would look like an empty menu. */
export function largestGroup<G extends { items: unknown[] }>(groups: G[]): G | undefined {
  return groups.reduce<G | undefined>((best, g) => (!best || g.items.length > best.items.length ? g : best), undefined);
}
