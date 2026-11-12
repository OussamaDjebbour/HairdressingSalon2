import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { algiersToday, useAdminBookings } from '../../data/admin';
import { toYmd } from '../../data/bookings';
import { formatLongDate, formatMonthYear, weekdayInitials } from '../../data/formatters';
import { dayHours } from '../../data/hours';
import { useAllStylists } from '../../data/queries';
import { monthGrid } from '../../data/roomFinder';
import { useClosedDates, useSalonHours } from '../../data/salonSettings';
import { dayOccupancy, salonDate } from '../../data/week';
import { Sheet } from './Sheet';
import { useSheetMotion } from './useSheetMotion';

/** What the owner is looking for room for: null means "Toutes". */
export interface RoomFilter {
  serviceId: string | null;
  stylistId: string | null;
}

export interface DayPickerProps {
  /** The agenda's day: the calendar opens on its month, with it selected. */
  day: Date;
  filter: RoomFilter;
  onFilterChange(filter: RoomFilter): void;
  /** Called after the calendar has slid away. */
  onJump(date: Date): void;
  /** Called after the calendar has slid away. */
  onPickTime(pick: { date: Date; time: string; stylistId: string; serviceId: string }): void;
  /** Called after the calendar has slid away. */
  onClose(): void;
}

const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** A month calendar to jump to any day, showing how full each day is. */
export function DayPicker({ day, onJump, onClose }: DayPickerProps) {
  const { lang, t } = useLang();
  const motion = useSheetMotion();
  const [month, setMonth] = useState(() => firstOfMonth(day));
  const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const bookings = useAdminBookings(month, lastOfMonth).data ?? [];
  const salonHours = useSalonHours().data;
  const closedDates = useClosedDates().data;
  const activeStylists = (useAllStylists().data ?? []).filter((s) => s.active);

  const now = new Date();
  const today = toYmd(algiersToday());
  const selected = toYmd(day);
  const waitingDays = new Set(
    bookings
      .filter((b) => b.status === 'pending' && b.source === 'online' && b.startsAt > now)
      .map((b) => toYmd(salonDate(b.startsAt)))
  );
  const shiftMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <Sheet title={t('admin.picker.title')} onRequestClose={() => motion.dismiss(onClose)} motion={motion.state}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shiftMonth(-1)} className="btn-ghost btn-sm tap" aria-label={t('admin.picker.prevMonth')}>
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
        </button>
        <h3 className="font-display text-lg font-semibold text-rose-900">{formatMonthYear(month, lang)}</h3>
        <button type="button" onClick={() => shiftMonth(1)} className="btn-ghost btn-sm tap" aria-label={t('admin.picker.nextMonth')}>
          <ChevronRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
        {weekdayInitials(lang).map((d, i) => (
          <span key={i} data-testid="weekday" className="text-center text-xs text-gold-700">{d}</span>
        ))}
      </div>

      <div data-testid="month-grid" className="grid grid-cols-7 gap-1">
        {monthGrid(month).map(({ date, inMonth }) => {
          const ymd = toYmd(date);
          const label = formatLongDate(date, lang);
          if (!inMonth) {
            return (
              <button
                key={ymd}
                type="button"
                onClick={() => motion.dismiss(() => onJump(date))}
                aria-label={label}
                className="tap h-12 rounded-xl text-sm text-cream-500"
              >
                {date.getDate()}
              </button>
            );
          }
          const hours = salonHours && closedDates ? dayHours(salonHours, closedDates, date) : undefined;
          const closed = hours === null;
          const pct = hours ? Math.round(dayOccupancy(bookings, date, activeStylists.length, hours) * 100) : 0;
          const waiting = waitingDays.has(ymd);
          const isSelected = ymd === selected;
          const status = closed ? t('schedule.closed') : `${pct}%`;
          return (
            <button
              key={ymd}
              type="button"
              disabled={closed}
              aria-pressed={isSelected}
              aria-label={`${label} — ${status}${waiting ? `, ${t('admin.picker.pending')}` : ''}`}
              onClick={() => motion.dismiss(() => onJump(date))}
              className={`tap relative h-12 flex flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                isSelected
                  ? 'bg-rose-800 border-rose-800 text-cream-50'
                  : closed
                  ? 'bg-cream-100 border-cream-100 text-cream-500 font-medium'
                  : 'bg-white border-cream-200 text-rose-900 hover:bg-cream-100'
              } ${ymd === today && !isSelected ? 'ring-2 ring-inset ring-gold-400' : ''}`}
            >
              {date.getDate()}
              {hours && (
                <span className={`block h-1 w-6 rounded-full overflow-hidden ${isSelected ? 'bg-cream-50/25' : 'bg-cream-200'}`}>
                  <span className="block h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
                </span>
              )}
              {waiting && <span className="absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
