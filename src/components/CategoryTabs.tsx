import { useRef, type KeyboardEvent } from 'react';
import { useLang } from '../context/LanguageContext';
import type { CategoryKey } from '../data/categories';

export const categoryTabId = (idBase: string, category: CategoryKey) => `${idBase}-tab-${category.replace(':', '-')}`;
export const categoryPanelId = (idBase: string) => `${idBase}-panel`;

/**
 * One category at a time for a long list of services (La carte, the booking's service step): thin text tabs on
 * a rule, the chosen one underlined. ARIA tabs with automatic activation; arrows follow the reading direction,
 * Home/End jump to the ends.
 * Render the list in an element with `role="tabpanel"`, `id={categoryPanelId(idBase)}` and
 * `aria-labelledby={categoryTabId(idBase, value)}`.
 */
export function CategoryTabs({
  idBase,
  items,
  value,
  onChange,
  className = '',
}: {
  idBase: string;
  items: { key: CategoryKey; label: string }[];
  value: CategoryKey;
  onChange: (category: CategoryKey) => void;
  className?: string;
}) {
  const { t, dir } = useLang();
  const categories = items.map((i) => i.key);
  const tabs = useRef<Partial<Record<CategoryKey, HTMLButtonElement | null>>>({});

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
      className={`flex flex-wrap gap-x-5 gap-y-1 sm:gap-x-6 border-b border-rose-900/10 ${className}`}
    >
      {items.map(({ key: category, label }) => {
        const selected = category === value;
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
            onClick={() => onChange(category)}
            className={`-mb-px flex min-h-[44px] items-center gap-1.5 border-b-2 text-[15px] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rose-900 ${
              selected ? 'border-rose-900 text-rose-900' : 'border-transparent text-rose-900/60 hover:text-rose-900'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
