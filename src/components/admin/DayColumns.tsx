import { Globe, PenLine } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { algiersToday, type AdminBooking } from '../../data/admin';
import { toYmd } from '../../data/bookings';
import { stylistWorks } from '../../data/hours';
import type { DayHours, Stylist, StylistDayOff } from '../../data/types';
import { minutesToTime, salonDate, salonMinutes } from '../../data/week';

const HOUR_HEIGHT = 64; // px per hour
const CELL_MINUTES = 30;
const QUARTER = 15;

interface DayColumnsProps {
  day: Date;
  stylists: Stylist[];
  /** The salon's hours that day, or null when closed. */
  hours: DayHours | null;
  /** Stylists' days off, to grey out whoever isn't working that day. */
  daysOff: StylistDayOff[];
  bookings: AdminBooking[];
  onSlotTap(stylistId: string, time: string): void;
  onBookingTap(b: AdminBooking): void;
}

const minutesOf = (b: AdminBooking) => (b.endsAt.getTime() - b.startsAt.getTime()) / 60000;

/**
 * One column per stylist; free time inside the day's hours is tappable to add a booking there.
 * The grid also stretches to bookings outside the hours (or on a closed day) so they can still be found.
 */
export function DayColumns({ day, stylists, hours, daysOff, bookings, onSlotTap, onBookingTap }: DayColumnsProps) {
  const { lang, t } = useLang();
  const ymd = toYmd(day);
  const visible = bookings.filter((b) => b.status !== 'cancelled' && toYmd(salonDate(b.startsAt)) === ymd);
  const gridTemplateColumns = `2.5rem repeat(${Math.max(stylists.length, 1)}, minmax(0, 1fr))`;

  const starts = visible.map((b) => salonMinutes(b.startsAt));
  const ends = visible.map((b) => salonMinutes(b.startsAt) + minutesOf(b));
  const OPEN = Math.floor(Math.min(hours?.opens ?? Infinity, ...starts) / 60) * 60;
  const CLOSE = Math.ceil(Math.max(hours?.closes ?? -Infinity, ...ends) / 60) * 60;
  const topPx = (min: number) => `${((min - OPEN) / 60) * HOUR_HEIGHT}px`;
  const outsideHours = (start: number, end: number) => !hours || start < hours.opens || end > hours.closes;

  // Free time is only offered inside the day's hours.
  const cells: number[] = [];
  if (hours) for (let min = hours.opens; min < hours.closes; min += CELL_MINUTES) cells.push(min);
  const hourLabels = Array.from({ length: Math.max(0, (CLOSE - OPEN) / 60 + 1) }, (_, i) => OPEN / 60 + i);

  const nowMin = salonMinutes(new Date());
  const showNow = ymd === toYmd(algiersToday()) && nowMin >= OPEN && nowMin < CLOSE;
  const works = (s: Stylist) => stylistWorks(s, daysOff, day);
  const closedNotice = (compact: boolean) => (
    <p className={`text-center text-rose-600 rounded-2xl bg-cream-100 ${compact ? 'py-3 mb-2' : 'py-16'}`}>{t('schedule.closed')}</p>
  );

  return (
    <div>
      <div className="grid gap-1 mb-2" style={{ gridTemplateColumns }}>
        <div />
        {stylists.map((s) => (
          <div key={s.id} className={`text-center text-xs font-semibold text-rose-800 truncate ${works(s) ? '' : 'opacity-60'}`}>
            {s.name}
          </div>
        ))}
      </div>

      {hours === null && visible.length === 0 ? (
        closedNotice(false)
      ) : (
        <>
          {hours === null && closedNotice(true)}
          <div className="relative grid gap-1" style={{ gridTemplateColumns, height: `${(CLOSE - OPEN) / 60 * HOUR_HEIGHT}px` }}>
            <div className="relative">
              {hourLabels.map((h) => (
                <span key={h} className="absolute start-0 -mt-2 text-[11px] text-rose-600" style={{ top: topPx(h * 60) }}>
                  {minutesToTime(h * 60)}
                </span>
              ))}
            </div>

            {stylists.map((stylist) => {
              const own = visible.filter((b) => b.stylistId === stylist.id);
              const busy = (from: number, to: number) =>
                own.some((b) => {
                  const start = salonMinutes(b.startsAt);
                  return start < to && start + minutesOf(b) > from;
                });
              // Each half-hour offers its free part: the whole half-hour, or just the free quarter next to a
              // booking that starts or ends at :15/:45. A hidden stylist can't take new bookings, so offers none.
              const freeSlots = (stylist.active ? cells : []).flatMap((min) => {
                const firstFree = !busy(min, min + QUARTER);
                const secondFree = !busy(min + QUARTER, min + CELL_MINUTES);
                if (firstFree && secondFree) return [{ min, length: CELL_MINUTES }];
                if (firstFree) return [{ min, length: QUARTER }];
                if (secondFree) return [{ min: min + QUARTER, length: QUARTER }];
                return [];
              });
              return (
                <div key={stylist.id} className={`relative rounded-lg bg-cream-50 ${works(stylist) ? '' : 'opacity-60'}`}>
                  {/* Time outside the day's hours (reached only by bookings there) is shaded. */}
                  {hours ? (
                    <>
                      {OPEN < hours.opens && <div className="absolute inset-x-0 top-0 rounded-t-lg bg-cream-200/60" style={{ height: topPx(hours.opens) }} />}
                      {CLOSE > hours.closes && <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-cream-200/60" style={{ top: topPx(hours.closes) }} />}
                    </>
                  ) : (
                    <div className="absolute inset-0 rounded-lg bg-cream-200/60" />
                  )}
                  {hourLabels.filter((h) => h * 60 > OPEN && h * 60 < CLOSE).map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-cream-200" style={{ top: topPx(h * 60) }} />
                  ))}
                  {freeSlots.map(({ min, length }) => {
                    const time = minutesToTime(min);
                    return (
                      <button
                        key={min}
                        type="button"
                        aria-label={`${stylist.name} ${time}`}
                        onClick={() => onSlotTap(stylist.id, time)}
                        className="absolute inset-x-0 rounded-md transition-colors hover:bg-rose-50 focus-visible:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                        style={{ top: topPx(min), height: `${(length / 60) * HOUR_HEIGHT}px` }}
                      />
                    );
                  })}

                  {own.map((b) => {
                    const SourceIcon = b.source === 'staff' ? PenLine : Globe;
                    const start = salonMinutes(b.startsAt);
                    const minutes = minutesOf(b);
                    const outside = outsideHours(start, start + minutes);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onBookingTap(b)}
                        className={`absolute inset-x-0.5 z-10 rounded-lg border px-1.5 py-1 text-start overflow-hidden transition-shadow hover:shadow-soft ${
                          b.status === 'confirmed' ? 'bg-rose-50' : 'bg-amber-50'
                        } ${outside ? 'border-dashed border-rust-400' : b.status === 'confirmed' ? 'border-rose-200' : 'border-amber-200'}`}
                        style={{ top: topPx(start), height: `${(minutes / 60) * HOUR_HEIGHT - 2}px` }}
                      >
                        {/* Two lines only (three when outside the hours), so a 45-minute booking shows everything; the source is an icon. */}
                        <span className="flex items-center gap-1">
                          <span className="flex-1 min-w-0 text-[11px] font-semibold text-rose-800 truncate">{b.clientName}</span>
                          <SourceIcon className="w-2.5 h-2.5 flex-shrink-0 text-rose-500" strokeWidth={2} aria-hidden="true" />
                          <span className="sr-only">{t(b.source === 'staff' ? 'schedule.source.staff' : 'schedule.source.online')}</span>
                        </span>
                        {/* Outside the hours, the marker takes the second line: it matters more than the service. */}
                        {outside && <span className="block text-[10px] font-semibold text-rust-700 truncate">{t('schedule.outsideHours')}</span>}
                        <span className="block text-[10px] text-rose-600 truncate">{b.serviceName[lang]}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {showNow && (
              <div
                className="absolute start-10 end-0 z-20 flex items-center pointer-events-none"
                style={{ top: topPx(nowMin) }}
              >
                <div className="w-2 h-2 rounded-full bg-rose-500 -ms-1" />
                <div className="flex-1 border-t-2 border-rose-500/60" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
