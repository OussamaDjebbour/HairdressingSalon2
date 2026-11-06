import { useLang } from '../../context/LanguageContext';
import { algiersToday, type AdminBooking } from '../../data/admin';
import { toYmd } from '../../data/bookings';
import { CLOSING_HOUR, OPENING_HOUR } from '../../data/hours';
import type { Stylist } from '../../data/types';
import { isClosedDay, minutesToTime, salonDate, salonMinutes } from '../../data/week';

const HOUR_HEIGHT = 64; // px per hour
const CELL_MINUTES = 30;
const OPEN = OPENING_HOUR * 60;
const CLOSE = CLOSING_HOUR * 60;

const topPx = (min: number) => `${((min - OPEN) / 60) * HOUR_HEIGHT}px`;

interface DayColumnsProps {
  day: Date;
  stylists: Stylist[];
  bookings: AdminBooking[];
  onSlotTap(stylistId: string, time: string): void;
  onBookingTap(b: AdminBooking): void;
}

/** One column per stylist; free time is tappable to add a booking there. */
export function DayColumns({ day, stylists, bookings, onSlotTap, onBookingTap }: DayColumnsProps) {
  const { lang, t } = useLang();
  const ymd = toYmd(day);
  const visible = bookings.filter((b) => b.status !== 'cancelled' && toYmd(salonDate(b.startsAt)) === ymd);
  const gridTemplateColumns = `2.5rem repeat(${Math.max(stylists.length, 1)}, minmax(0, 1fr))`;

  const cells: number[] = [];
  for (let min = OPEN; min < CLOSE; min += CELL_MINUTES) cells.push(min);
  const hours = Array.from({ length: CLOSING_HOUR - OPENING_HOUR + 1 }, (_, i) => OPENING_HOUR + i);

  const nowMin = salonMinutes(new Date());
  const showNow = ymd === toYmd(algiersToday()) && nowMin >= OPEN && nowMin < CLOSE;

  return (
    <div>
      <div className="grid gap-1 mb-2" style={{ gridTemplateColumns }}>
        <div />
        {stylists.map((s) => (
          <div key={s.id} className="text-center text-xs font-semibold text-rose-800 truncate">
            {s.name}
          </div>
        ))}
      </div>

      {isClosedDay(day) ? (
        <p className="text-center text-rose-600 py-16 rounded-2xl bg-cream-100">{t('schedule.closed')}</p>
      ) : (
        <div className="relative grid gap-1" style={{ gridTemplateColumns, height: `${(CLOSE - OPEN) / 60 * HOUR_HEIGHT}px` }}>
          <div className="relative">
            {hours.map((h) => (
              <span key={h} className="absolute start-0 -mt-2 text-[11px] text-rose-600" style={{ top: topPx(h * 60) }}>
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>

          {stylists.map((stylist) => {
            const own = visible.filter((b) => b.stylistId === stylist.id);
            const covered = (min: number) =>
              own.some((b) => {
                const start = salonMinutes(b.startsAt);
                const end = start + (b.endsAt.getTime() - b.startsAt.getTime()) / 60000;
                return start < min + CELL_MINUTES && end > min;
              });
            return (
              <div key={stylist.id} className="relative rounded-lg bg-cream-50">
                {hours.slice(1, -1).map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-cream-200" style={{ top: topPx(h * 60) }} />
                ))}
                {cells.filter((min) => !covered(min)).map((min) => {
                  const time = minutesToTime(min);
                  return (
                    <button
                      key={min}
                      type="button"
                      aria-label={`${stylist.name} ${time}`}
                      onClick={() => onSlotTap(stylist.id, time)}
                      className="absolute inset-x-0 rounded-md transition-colors hover:bg-rose-50 focus-visible:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                      style={{ top: topPx(min), height: `${(CELL_MINUTES / 60) * HOUR_HEIGHT}px` }}
                    />
                  );
                })}

                {own.map((b) => {
                  const start = salonMinutes(b.startsAt);
                  const minutes = (b.endsAt.getTime() - b.startsAt.getTime()) / 60000;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onBookingTap(b)}
                      className={`absolute inset-x-0.5 z-10 rounded-lg border px-1.5 py-1 text-start overflow-hidden transition-shadow hover:shadow-soft ${
                        b.status === 'confirmed' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
                      }`}
                      style={{ top: topPx(start), height: `${(minutes / 60) * HOUR_HEIGHT - 2}px` }}
                    >
                      <span className="block text-[11px] font-semibold text-rose-800 truncate">{b.clientName}</span>
                      <span className="block text-[10px] text-rose-600 truncate">{b.serviceName[lang]}</span>
                      <span className="block text-[9px] text-rose-500 truncate">
                        {t(b.source === 'staff' ? 'schedule.source.staff' : 'schedule.source.online')}
                      </span>
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
      )}
    </div>
  );
}
