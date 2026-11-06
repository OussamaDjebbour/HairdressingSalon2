import { useLang } from '../../context/LanguageContext';
import type { AdminBooking } from '../../data/admin';
import { toYmd } from '../../data/bookings';
import { formatDayName, formatShortDayName } from '../../data/formatters';
import { dayOccupancy, isClosedDay, weekDays } from '../../data/week';

interface WeekStripProps {
  day: Date;
  bookings: AdminBooking[];
  stylistCount: number;
  onSelect(d: Date): void;
}

/** The week around `day`: tap a day to open it; the bar shows how full each open day is. */
export function WeekStrip({ day, bookings, stylistCount, onSelect }: WeekStripProps) {
  const { lang, t } = useLang();
  const selected = toYmd(day);

  return (
    <div className="flex gap-1.5">
      {weekDays(day).map((d) => {
        const closed = isClosedDay(d);
        const isSelected = toYmd(d) === selected;
        const pct = Math.round(dayOccupancy(bookings, d, stylistCount) * 100);
        const label = `${formatDayName(d, lang)} ${d.getDate()} — ${closed ? t('schedule.closed') : `${pct}%`}`;
        return (
          <button
            key={toYmd(d)}
            type="button"
            onClick={() => onSelect(d)}
            disabled={closed}
            aria-pressed={isSelected}
            aria-label={label}
            className={`flex-1 min-w-0 rounded-xl px-1 pt-1.5 pb-2 text-center transition-colors duration-200 ease-silk disabled:opacity-40 disabled:cursor-not-allowed ${
              isSelected ? 'bg-rose-800 text-cream-50 shadow-soft' : 'bg-white border border-cream-200 text-rose-800 hover:bg-cream-100'
            }`}
          >
            <span className="block text-[11px] truncate">{formatShortDayName(d, lang)}</span>
            <span className="block font-display text-lg font-semibold leading-tight">{d.getDate()}</span>
            {!closed && (
              <span className={`block h-1 mx-1.5 mt-1 rounded-full overflow-hidden ${isSelected ? 'bg-cream-50/25' : 'bg-cream-200'}`}>
                <span className="block h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
