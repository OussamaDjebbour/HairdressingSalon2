import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useLang } from '../context/LanguageContext';
import { categoryLabel, type CategoryKey, type CustomCategory } from '../data/categories';
import { countText } from '../data/formatters';

export const categoryTabId = (idBase: string, category: CategoryKey) => `${idBase}-tab-${category}`;
export const categoryPanelId = (idBase: string) => `${idBase}-panel`;

/**
 * One category at a time for a long list of services (La carte, the booking's service step): thin text tabs on
 * a rule, the chosen one underlined. ARIA tabs with automatic activation; arrows follow the reading direction,
 * Home/End jump to the ends. `chosen` shows, per category, how many services the client has ticked in it.
 * Render the list in an element with `role="tabpanel"`, `id={categoryPanelId(idBase)}` and
 * `aria-labelledby={categoryTabId(idBase, value)}`.
 */
export function CategoryTabs({
  idBase,
  categories,
  custom = [],
  value,
  onChange,
  chosen,
  className = '',
}: {
  idBase: string;
  categories: CategoryKey[];
  /** The salon's own categories, to name their tabs. */
  custom?: CustomCategory[];
  value: CategoryKey;
  onChange: (category: CategoryKey) => void;
  chosen?: Partial<Record<CategoryKey, number>>;
  className?: string;
}) {
  const { t, lang, dir } = useLang();
  const tabs = useRef<Partial<Record<CategoryKey, HTMLButtonElement | null>>>({});

  // On a narrow phone the row scrolls sideways: keep the chosen tab fully in view, scrolling only the row
  // (never the page, so a tab chosen off-screen, e.g. by a tile on the page, doesn't move the page).
  useLayoutEffect(() => {
    const tab = tabs.current[value];
    const row = tab?.parentElement;
    if (!tab || !row) return;
    const t = tab.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (t.left < r.left) row.scrollLeft -= r.left - t.left;
    else if (t.right > r.right) row.scrollLeft += t.right - r.right;
  }, [value]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = categories.indexOf(value);
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    let next: number;
    if (e.key === forward) next = (i + 1) % categories.length;
    else if (e.key === backward) next = (i - 1 + categories.length) % categories.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = categories.length - 1;
    else return;
    e.preventDefault();
    onChange(categories[next]);
    tabs.current[categories[next]]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={t('services.categories')}
      onKeyDown={onKeyDown}
      className={`flex gap-x-5 sm:gap-x-6 overflow-x-auto no-scrollbar border-b border-rose-900/10 ${className}`}
    >
      {categories.map((category) => {
        const selected = category === value;
        const n = chosen?.[category] ?? 0;
        const label = categoryLabel(category, custom, t, lang);
        return (
          <button
            key={category}
            ref={(el) => {
              tabs.current[category] = el;
            }}
            type="button"
            role="tab"
            id={categoryTabId(idBase, category)}
            aria-selected={selected}
            aria-controls={categoryPanelId(idBase)}
            tabIndex={selected ? 0 : -1}
            aria-label={n > 0 ? `${label} (${countText(t, lang, 'booking.tab.chosen', n)})` : undefined}
            onClick={() => onChange(category)}
            className={`-mb-px flex min-h-[44px] shrink-0 items-center gap-1.5 border-b-2 text-[15px] whitespace-nowrap transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rose-900 ${
              selected ? 'border-rose-900 text-rose-900' : 'border-transparent text-rose-900/60 hover:text-rose-900'
            }`}
          >
            {label}
            {n > 0 && (
              <span
                aria-hidden="true"
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-900 px-1.5 text-xs leading-none text-pearl-50 tabular-nums"
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
