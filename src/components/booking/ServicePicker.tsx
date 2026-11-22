import { Check, ChevronDown } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import type { CategoryKey } from '../../data/categories';
import { countText, formatDuration } from '../../data/formatters';
import { effectivePrice } from '../../data/pricing';
import type { Service } from '../../data/types';
import { PackIncludes } from '../PackIncludes';
import { PriceTag } from '../PriceTag';

const panelId = (key: CategoryKey) => `booking-services-${key.replace(':', '-')}`;

/**
 * The booking's service step: the salon's categories as sections that open and close (several may be open),
 * each a list of compact rows (name, price, duration, a check when ticked). One category: just the rows.
 */
export function ServicePicker({
  groups,
  labels,
  selectedIds,
  atMax,
  onToggle,
  open,
  onOpenChange,
}: {
  groups: { key: CategoryKey; items: Service[] }[];
  labels: Record<string, string>;
  selectedIds: string[];
  atMax: boolean;
  onToggle: (service: Service) => void;
  open: CategoryKey[];
  onOpenChange: (next: CategoryKey[]) => void;
}) {
  const { t, lang } = useLang();

  const rows = (items: Service[]) => (
    <ul className="divide-y divide-rose-900/10">
      {items.map((service) => {
        const isSelected = selectedIds.includes(service.id);
        const blocked = !isSelected && atMax;
        return (
          <li key={service.id}>
            <button
              type="button"
              aria-pressed={isSelected}
              aria-disabled={blocked || undefined}
              onClick={() => onToggle(service)}
              className={`flex w-full min-h-[44px] items-center gap-3 py-3 text-start transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rose-900 ${
                isSelected ? 'bg-pearl-100' : blocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-pearl-100/60'
              }`}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-display text-lg leading-tight text-rose-900">{service.name[lang]}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="font-display text-lg text-rose-900 tabular-nums"><PriceTag {...effectivePrice(service)} align="start" /></span>
                    <span className="text-sm text-rose-900/70 whitespace-nowrap">{formatDuration(service.duration, lang)}</span>
                  </span>
                </span>
                {service.category === 'pack' && <PackIncludes service={service} className="mt-1 text-sm leading-relaxed text-rose-900/75" />}
              </span>
              <span className="flex w-4 shrink-0 justify-center">
                {isSelected && <Check className="w-4 h-4 text-rose-900" strokeWidth={2} aria-hidden="true" />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  if (groups.length === 1) return rows(groups[0].items);

  return (
    <div className="border-t border-rose-900/10">
      {groups.map(({ key, items }) => {
        const isOpen = open.includes(key);
        const label = labels[key] ?? key;
        const ticked = items.filter((s) => selectedIds.includes(s.id)).length;
        const count = countText(t, lang, 'booking.visit.count', items.length);
        return (
          <section key={key} className="border-b border-rose-900/10">
            <h4>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId(key)}
                aria-label={`${label}, ${count}${ticked > 0 ? ` (${countText(t, lang, 'booking.tab.chosen', ticked)})` : ''}`}
                onClick={() => onOpenChange(isOpen ? open.filter((k) => k !== key) : [...open, key])}
                className="flex w-full min-h-[44px] items-center gap-3 py-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rose-900"
              >
                <span className="font-display text-lg text-rose-900">{label}</span>
                <span className="text-sm text-rose-900/60">{count}</span>
                {ticked > 0 && (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-900 px-1.5 text-xs leading-none text-pearl-50 tabular-nums"
                  >
                    {ticked}
                  </span>
                )}
                <ChevronDown
                  aria-hidden="true"
                  className={`ms-auto w-4 h-4 shrink-0 text-rose-900/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </h4>
            {isOpen && <div id={panelId(key)}>{rows(items)}</div>}
          </section>
        );
      })}
    </div>
  );
}
