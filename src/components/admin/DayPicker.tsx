import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { algiersToday, useAdminBookings } from '../../data/admin';
import { toYmd } from '../../data/bookings';
import { countText, formatLongDate, formatMonthYear, weekdayInitials } from '../../data/formatters';
import { dayHours } from '../../data/hours';
import { useAllServices, useAllStylists } from '../../data/queries';
import { dayRoom, monthGrid, roomLevel, type DayRoom } from '../../data/roomFinder';
import { useClosedDates, useSalonHours, useStylistDaysOff } from '../../data/salonSettings';
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
  const daysOff = useStylistDaysOff().data ?? [];
  const activeServices = (useAllServices().data ?? []).filter((s) => s.active);
  const activeStylists = (useAllStylists().data ?? []).filter((s) => s.active);

  // A remembered choice that was hidden since counts as "Toutes".
  const service = activeServices.find((s) => s.id === filter.serviceId) ?? null;
  const stylist = activeStylists.find((s) => s.id === filter.stylistId) ?? null;
  const ready = !!bookingsQuery.data && !!salonHours && !!closedDates;
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
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label htmlFor="picker-service" className="label">{t('admin.sheet.service')}</label>
          <select
            id="picker-service"
            className="input"
            value={service?.id ?? ''}
            onChange={(e) => {
              setPicked(null);
              onFilterChange({ serviceId: e.target.value || null, stylistId: stylist?.id ?? null });
            }}
          >
            <option value="">{t('admin.picker.all')}</option>
            {activeServices.map((s) => (
              <option key={s.id} value={s.id}>{s.name[lang]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="picker-stylist" className="label">{t('admin.sheet.stylist')}</label>
          <select
            id="picker-stylist"
            className="input"
            value={stylist?.id ?? ''}
            onChange={(e) => onFilterChange({ serviceId: service?.id ?? null, stylistId: e.target.value || null })}
          >
            <option value="">{t('admin.picker.all')}</option>
            {activeStylists.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
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
            : `${pct}%`;
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
                ) : room && (room.kind === 'full' || room.kind === 'absent') ? (
                  <span aria-hidden="true" className={`text-xs leading-4 font-medium ${isSelected ? 'text-cream-100' : 'text-cream-500'}`}>
                    {roomLabel(room)}
                  </span>
                ) : null
              ) : hours && (
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
