import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { countText } from '../data/formatters';

/**
 * One category as a disclosure: a header button (label, "n prestations", optional ticked badge, chevron)
 * and, when open, its panel. Shared by La carte and the booking's service step.
 */
export function CategorySection({
  id,
  label,
  count,
  chosen = 0,
  open,
  onToggle,
  as: Heading = 'h4',
  thumbnail,
  children,
}: {
  id: string;
  label: string;
  count: number;
  chosen?: number;
  open: boolean;
  onToggle: () => void;
  as?: 'h3' | 'h4';
  /** Decorative photo shown in the header while the section is closed. */
  thumbnail?: string;
  children: ReactNode;
}) {
  const { t, lang } = useLang();
  const countLabel = countText(t, lang, 'booking.visit.count', count);
  const panelId = id.replace(':', '-');
  return (
    <section className="border-b border-rose-900/10">
      <Heading>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full min-h-[44px] items-center gap-3 py-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rose-900"
        >
          {thumbnail && !open && (
            <img src={thumbnail} alt="" loading="lazy" className="w-14 aspect-[3/4] object-cover shrink-0" />
          )}
          {/* The visible words are the button's name (voice control users say what they see). */}
          <span className="min-w-0 break-words font-display text-lg text-rose-900">{label}</span>{' '}
          <span className="whitespace-nowrap text-sm text-rose-900/70">{countLabel}</span>
          {chosen > 0 && (
            <span
              aria-hidden="true"
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-900 px-1.5 text-xs leading-none text-pearl-50 tabular-nums"
            >
              {chosen}
            </span>
          )}
          {chosen > 0 && <>{' '}<span className="sr-only">{countText(t, lang, 'booking.tab.chosen', chosen)}</span></>}
          <ChevronDown
            aria-hidden="true"
            className={`ms-auto w-4 h-4 shrink-0 text-rose-900/60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </Heading>
      {open && <div id={panelId}>{children}</div>}
    </section>
  );
}
