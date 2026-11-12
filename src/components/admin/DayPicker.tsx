import { useState } from 'react';
import { ChevronLeft, ChevronRight, UserX } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { algiersToday, useAdminBookings } from '../../data/admin';
import { toYmd } from '../../data/bookings';
import { countText, formatLongDate, formatMonthYear, weekdayInitials } from '../../data/formatters';
import { dayHours } from '../../data/hours';
import { useAllServices, useAllStylists } from '../../data/queries';
import { dayRoom, monthGrid, roomLevel, type DayRoom } from '../../data/roomFinder';
import { useClosedDates, useSalonHours, useStylistDaysOff } from '../../data/salonSettings';
import { dayOccupancy, salonDate } from '../../data/week';
import { DataError } from '../DataError';
import { SelectField } from '../form/SelectField';
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

/** The "Toutes" option's value (a Radix Select item can't have an empty value). */
const ALL = '__all__';

const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * A month calendar to jump to any day, showing how full each day is. With a service chosen
 * (and optionally a coiffeuse), each day shows how many start times fit, and a tapped day lists
 * them: a tapped time is picked for a new booking.
 */
export function DayPicker({ day, filter, onFilterChange, onJump, onPickTime, onClose }: DayPickerProps) {
  const { lang, t } = useLang();
  const motion = useSheetMotion();
  const [month, setMonth] = useState(() => firstOfMonth(day));
  const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const bookingsQuery = useAdminBookings(month, lastOfMonth);
  const bookings = bookingsQuery.data ?? [];
  const salonHours = useSalonHours().data;
  const closedDates = useClosedDates().data;
  const daysOffQuery = useStylistDaysOff();
  const daysOff = daysOffQuery.data ?? [];
  const activeServices = (useAllServices().data ?? []).filter((s) => s.active);
  const stylistsQuery = useAllStylists();
  const activeStylists = (stylistsQuery.data ?? []).filter((s) => s.active);

  // A remembered choice that was hidden since counts as "Toutes".
  const service = activeServices.find((s) => s.id === filter.serviceId) ?? null;
  const stylist = activeStylists.find((s) => s.id === filter.stylistId) ?? null;
  // Until the month's bookings (and, for counts, the coiffeuses and days off) are in, no day is
  // shown as empty or full: a wrong "0%" or "complet" is worse than none.
  const bookingsReady = !!bookingsQuery.data;
  const ready = bookingsReady && !!salonHours && !!closedDates && !!stylistsQuery.data && !!daysOffQuery.data;
  const [picked, setPicked] = useState<Date | null>(null);

  const now = new Date();
  const today = toYmd(algiersToday());
  const selected = toYmd(day);
  const waitingDays = new Set(
    bookings
      .filter((b) => b.status === 'pending' && b.source === 'online' && b.startsAt > now)
      .map((b) => toYmd(salonDate(b.startsAt)))
  );
  const shiftMonth = (delta: number) => {
    setPicked(null);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  /** Room for the chosen service on a date (null without a service, or while loading). */
  const roomOn = (date: Date): DayRoom | null =>
    service && ready
      ? dayRoom({
          date,
          hours: dayHours(salonHours!, closedDates!, date),
          durationMin: service.duration,
          candidates: stylist ? [stylist] : activeStylists,
          specific: !!stylist,
          daysOff,
          bookings,
          now,
        })
      : null;
  const roomLabel = (room: DayRoom) =>
    room.kind === 'room'
      ? countText(t, lang, 'admin.picker.slots', room.starts.length)
      : room.kind === 'absent'
      ? t('admin.picker.absent')
      : room.kind === 'full'
      ? t('admin.picker.full')
      : '';
  const tapDay = (date: Date) => (service ? setPicked(date) : motion.dismiss(() => onJump(date)));
  const pickedRoom = picked ? roomOn(picked) : null;

  return (
    <Sheet title={t('admin.picker.title')} onRequestClose={() => motion.dismiss(onClose)} motion={motion.state}>
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <SelectField
          id="picker-service"
          label={t('admin.sheet.service')}
          value={service?.id ?? ALL}
          options={[{ value: ALL, label: t('admin.picker.all') }, ...activeServices.map((s) => ({ value: s.id, label: s.name[lang] }))]}
          onValueChange={(v) => {
            setPicked(null);
            onFilterChange({ serviceId: v === ALL ? null : v, stylistId: stylist?.id ?? null });
          }}
        />
        <SelectField
          id="picker-stylist"
          label={t('admin.sheet.stylist')}
          value={stylist?.id ?? ALL}
          options={[{ value: ALL, label: t('admin.picker.all') }, ...activeStylists.map((s) => ({ value: s.id, label: s.name }))]}
          onValueChange={(v) => onFilterChange({ serviceId: service?.id ?? null, stylistId: v === ALL ? null : v })}
        />
      </div>

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

      {bookingsQuery.isError && !bookingsReady && <DataError onRetry={() => void bookingsQuery.refetch()} />}

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
          const isSelected = service ? !!picked && toYmd(picked) === ymd : ymd === selected;
          const room = closed ? null : roomOn(date);
          const status = closed
            ? t('schedule.closed')
            : service
            ? room && room.kind !== 'past' ? roomLabel(room) : ''
            : bookingsReady
            ? `${pct}%`
            : '';
          return (
            <button
              key={ymd}
              type="button"
              disabled={closed}
              aria-pressed={isSelected}
              aria-label={`${label}${status ? ` — ${status}` : ''}${waiting ? `, ${t('admin.picker.pending')}` : ''}`}
              onClick={() => tapDay(date)}
              className={`tap relative h-12 flex flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                isSelected
                  ? 'bg-rose-800 border-rose-800 text-cream-50'
                  : closed
                  ? 'bg-cream-100 border-cream-100 text-cream-500 font-medium'
                  : 'bg-white border-cream-200 text-rose-900 hover:bg-cream-100'
              } ${ymd === today && !isSelected ? 'ring-2 ring-inset ring-gold-400' : ''}`}
            >
              {date.getDate()}
              {service ? (
                room?.kind === 'room' ? (
                  <span
                    data-testid="room-count"
                    aria-hidden="true"
                    className={`px-1.5 rounded-full text-xs leading-4 ${
                      roomLevel(room.starts.length) === 'lots' ? 'bg-sage-100 text-sage-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {room.starts.length}
                  </span>
                ) : room?.kind === 'full' ? (
                  // The words are in the button's name; a 44 px cell only has room for a sign.
                  <span data-testid="room-count" aria-hidden="true" className="px-1.5 rounded-full text-xs leading-4 bg-cream-200 text-rose-700">0</span>
                ) : room?.kind === 'absent' ? (
                  <UserX data-testid="room-absent" aria-hidden="true" className={`w-3.5 h-3.5 ${isSelected ? 'text-cream-100' : 'text-rose-500'}`} strokeWidth={1.8} />
                ) : null
              ) : hours && bookingsReady && (
                <span className={`block h-1 w-6 rounded-full overflow-hidden ${isSelected ? 'bg-cream-50/25' : 'bg-cream-200'}`}>
                  <span className="block h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
                </span>
              )}
              {waiting && <span className="absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {service && picked && (
        <div className="mt-4 pt-4 border-t border-cream-200">
          {pickedRoom?.kind === 'room' ? (
            <>
              <p className="text-sm text-rose-700 mb-2">{t('admin.picker.times').replace('{day}', formatLongDate(picked, lang))}</p>
              <div className="flex flex-wrap gap-2">
                {pickedRoom.starts.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    dir="ltr"
                    onClick={() =>
                      motion.dismiss(() => onPickTime({ date: picked, time: s.time, stylistId: s.stylistId, serviceId: service.id }))
                    }
                    className="btn-secondary btn-sm tap"
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            </>
          ) : (
            pickedRoom && pickedRoom.kind !== 'past' && pickedRoom.kind !== 'closed' && (
              <p className="text-sm text-rose-600">{formatLongDate(picked, lang)} — {roomLabel(pickedRoom)}</p>
            )
          )}
          <button
            type="button"
            onClick={() => motion.dismiss(() => onJump(picked))}
            className="tap flex items-center mx-auto mt-2 px-3 text-sm text-rose-700 underline underline-offset-4 hover:text-rose-900"
          >
            {t('admin.picker.viewDay')}
          </button>
        </div>
      )}
    </Sheet>
  );
}
