import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Check, X, Phone, ArrowRight, ChevronLeft, ChevronRight, Plus, BellRing } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { toYmd } from '../data/bookings';
import {
  algiersToday, formatAlgiersTime, isNotAuthorized, useAdminBookings,
  type AdminBooking, type BookingStatus,
} from '../data/admin';
import { useAllStylists } from '../data/queries';
import { formatPrice, formatDuration, formatLongDate, formatShortDayName } from '../data/formatters';
import { dayHours, stylistWorks } from '../data/hours';
import { useClosedDates, useSalonHours, useStylistDaysOff } from '../data/salonSettings';
import { dayOccupancy, minutesToTime, salonDate, salonMinutes, weekDays } from '../data/week';
import { DataError } from './DataError';
import { Thread } from './Thread';
import { Badge } from './Badge';
import { SalonGate } from './admin/SalonGate';
import { WeekStrip } from './admin/WeekStrip';
import { DayColumns } from './admin/DayColumns';
import { BookingSheet, type SheetState } from './admin/BookingSheet';
import { PendingSheet } from './admin/PendingSheet';

// Online bookings are at most today + 13 days, but the owner can move a waiting one further out;
// 30 days stays within admin_list_bookings' 31-day range cap.
const PENDING_WINDOW_DAYS = 30;

function durationMinutes(b: AdminBooking): number {
  return Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);
}

/** "YYYY-MM-DD" → local-midnight Date, or null when absent or malformed. */
function parseYmd(value: string | null): Date | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const Icon = status === 'confirmed' ? Check : status === 'cancelled' ? X : Clock;
  return (
    <Badge variant={status} className="flex-shrink-0">
      <Icon className="w-3 h-3" strokeWidth={2.5} />
    </Badge>
  );
}

/** First free half-hour for a stylist on a day (from now if it's today), else opening time. */
function firstFreeTime(bookings: AdminBooking[], stylistId: string, isToday: boolean, opens: number, closes: number): string {
  const now = isToday ? salonMinutes(new Date()) : 0;
  for (let min = opens; min + 30 <= closes; min += 30) {
    if (min < now) continue;
    const busy = bookings.some((b) => {
      if (b.stylistId !== stylistId || b.status === 'cancelled') return false;
      const start = salonMinutes(b.startsAt);
      return start < min + 30 && start + durationMinutes(b) > min;
    });
    if (!busy) return minutesToTime(min);
  }
  return minutesToTime(opens);
}

function ScheduleBody() {
  const { lang, t } = useLang();
  // A notification opens /admin?day=YYYY-MM-DD&booking=<id>: start on that day, then open the booking.
  const [searchParams, setSearchParams] = useSearchParams();
  const [day, setDay] = useState(() => parseYmd(searchParams.get('day')) ?? algiersToday());
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [showWaiting, setShowWaiting] = useState(false);
  // Hidden stylists too: one with a booking that day still gets a column.
  const allStylists = useAllStylists().data ?? [];
  const stylists = allStylists.filter((s) => s.active);
  const hoursQuery = useSalonHours();
  const closedQuery = useClosedDates();
  const daysOff = useStylistDaysOff().data ?? [];
  const salonHours = hoursQuery.data;
  const closedDates = closedQuery.data;
  // Without the hours every day would look closed: show loading or an error instead (below).
  const settingsReady = salonHours !== undefined && closedDates !== undefined;
  const settingsFailed = !settingsReady && (hoursQuery.isError || closedQuery.isError);
  const hoursFor = (d: Date) => (salonHours && closedDates ? dayHours(salonHours, closedDates, d) : null);

  const today = algiersToday();
  const week = weekDays(day);
  const weekQuery = useAdminBookings(week[0], week[6]);
  const pendingQuery = useAdminBookings(today, addDays(today, PENDING_WINDOW_DAYS));

  const isToday = toYmd(day) === toYmd(today);
  const now = new Date();

  const all = useMemo(
    () =>
      (weekQuery.data ?? [])
        .filter((b) => toYmd(salonDate(b.startsAt)) === toYmd(day))
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [weekQuery.data, day]
  );
  const active = all.filter((b) => b.status !== 'cancelled');
  const columns = allStylists.filter((s) => s.active || active.some((b) => b.stylistId === s.id));
  const totalRevenue = active.reduce((sum, b) => sum + b.price, 0);
  const occupationRate = Math.round(dayOccupancy(all, day, stylists.length, hoursFor(day)) * 100);
  // Today: the next booking still to come, today or (if none is left) on a later day of the loaded window.
  // Another day: that day's first booking.
  const upcoming = isToday
    ? active.find((b) => b.startsAt > now) ??
      (pendingQuery.data ?? [])
        .filter((b) => b.status !== 'cancelled' && b.startsAt > now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
    : active[0];
  const upcomingLabel = (b: AdminBooking) => {
    const time = formatAlgiersTime(b.startsAt);
    const d = salonDate(b.startsAt);
    if (toYmd(d) === toYmd(day)) return time;
    const dayName = lang === 'fr' ? `${formatShortDayName(d, lang).toLowerCase()}.` : formatShortDayName(d, lang);
    return t('schedule.nextOn').replace('{day}', `${dayName} ${d.getDate()}`).replace('{time}', time);
  };

  const waiting = (pendingQuery.data ?? [])
    .filter((b) => b.status === 'pending' && b.startsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const linkedBookingId = searchParams.get('booking');
  const hasLink = searchParams.has('day') || searchParams.has('booking');
  useEffect(() => {
    if (!hasLink || !weekQuery.data) return;
    const linked = linkedBookingId ? weekQuery.data.find((b) => b.id === linkedBookingId) : undefined;
    if (linked) setSheet({ mode: 'edit', booking: linked });
    setSearchParams({}, { replace: true }); // a refresh shouldn't reopen it
  }, [hasLink, linkedBookingId, weekQuery.data, setSearchParams]);

  const shiftDay = (delta: number) => setDay((d) => addDays(d, delta));

  const openAdd = () => {
    // A closed day can only fail: start on the next open day instead (within a year, in case none is open).
    let date = day;
    for (let i = 0; i < 366 && !hoursFor(date); i++) date = addDays(date, 1);
    const hours = hoursFor(date);
    if (!hours) return;
    const stylistId = (stylists.find((s) => stylistWorks(s, daysOff, date)) ?? stylists[0])?.id;
    if (!stylistId) return;
    const onDate = (weekQuery.data ?? []).filter((b) => toYmd(salonDate(b.startsAt)) === toYmd(date));
    setSheet({ mode: 'add', stylistId, date, time: firstFreeTime(onDate, stylistId, toYmd(date) === toYmd(today), hours.opens, hours.closes) });
  };

  if (weekQuery.isError && isNotAuthorized(weekQuery.error)) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.notAuthorized')}</p>;
  }

  return (
    <section id="schedule" className="relative pb-10 lg:pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Day bar: stays at the top while the agenda scrolls */}
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mb-4 px-4 sm:px-6 lg:px-8 py-2.5 bg-cream-50/95 backdrop-blur border-b border-cream-200">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-1">
              <button onClick={() => shiftDay(-1)} className="btn-ghost btn-sm" aria-label={t('admin.prevDay')}>
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
              </button>
              <span className="font-display text-lg font-semibold text-rose-900 text-center whitespace-nowrap sm:min-w-[11rem]">{formatLongDate(day, lang)}</span>
              <button onClick={() => shiftDay(1)} className="btn-ghost btn-sm" aria-label={t('admin.nextDay')}>
                <ChevronRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 ms-auto">
              {!isToday && (
                <button onClick={() => setDay(algiersToday())} className="btn-secondary btn-sm">
                  {t('schedule.today')}
                </button>
              )}
              {waiting.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowWaiting(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-200 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-200 transition-colors"
                >
                  <BellRing className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                  {t('schedule.pendingCount').replace('{n}', String(waiting.length))}
                </button>
              )}
              {/* Add a booking (WhatsApp, phone, walk-in) */}
              <button type="button" onClick={openAdd} aria-label={t('admin.sheet.addTitle')} className="btn-primary btn-sm">
                <Plus className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                {t('schedule.addShort')}
              </button>
            </div>
          </div>
        </div>

        {settingsReady && (
          <div className="max-w-3xl mx-auto mb-6">
            <WeekStrip day={day} bookings={weekQuery.data ?? []} stylistCount={stylists.length} hoursFor={hoursFor} onSelect={setDay} />
          </div>
        )}

        {weekQuery.isError || settingsFailed ? (
          <DataError
            onRetry={() => {
              if (weekQuery.isError) weekQuery.refetch();
              if (hoursQuery.isError) hoursQuery.refetch();
              if (closedQuery.isError) closedQuery.refetch();
            }}
          />
        ) : weekQuery.isLoading || !settingsReady ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
          </div>
        ) : (
          <div>
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Day: one column per stylist, then the day in one line */}
              {/* min-w-0: a wide day (many stylists) scrolls inside its card, not the whole page */}
              <div className="lg:col-span-2 min-w-0">
                <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-3 sm:p-6">
                  <DayColumns
                    day={day}
                    stylists={columns}
                    hours={hoursFor(day)}
                    daysOff={daysOff}
                    bookings={all}
                    onSlotTap={(stylistId, time) => setSheet({ mode: 'add', stylistId, date: day, time })}
                    onBookingTap={(booking) => setSheet({ mode: 'edit', booking })}
                  />
                </div>
                <div className="mt-3 px-1 text-sm text-rose-700 space-y-0.5">
                  <p className="flex flex-wrap gap-x-2">
                    <span>{t('schedule.summary.count').replace('{n}', String(active.length))}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatPrice(totalRevenue, lang)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t('schedule.summary.rate').replace('{rate}', String(occupationRate))}</span>
                  </p>
                  {upcoming ? (
                    <p className="font-medium text-rose-900">{t('schedule.next').replace('{when}', upcomingLabel(upcoming))}</p>
                  ) : (
                    isToday && <p className="text-rose-600">{t('schedule.noUpcoming')}</p>
                  )}
                </div>
              </div>

              {/* Side list, large screens only (includes cancelled bookings, which can be restored from the sheet) */}
              <div className="hidden lg:block">
                <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-5">
                  <h3 className="font-display text-base font-semibold text-rose-800 mb-4">{formatLongDate(day, lang)}</h3>
                  {all.length === 0 ? (
                    <p className="text-sm text-rose-600 py-6 text-center">{t('schedule.empty')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {all.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSheet({ mode: 'edit', booking: b })}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl text-start hover:bg-cream-50 transition-colors"
                        >
                          <span className="flex flex-col items-center justify-center w-12 flex-shrink-0">
                            <span className="text-sm font-semibold text-rose-700">{formatAlgiersTime(b.startsAt)}</span>
                            <span className="text-[10px] text-rose-600">{formatDuration(durationMinutes(b), lang)}</span>
                          </span>
                          <Thread variant="connector" className="h-10 text-rose-300" />
                          <span className="flex-1 min-w-0">
                            <span className={`block text-sm font-medium truncate ${b.status === 'cancelled' ? 'text-cream-500 line-through' : 'text-rose-800'}`}>
                              {b.clientName}
                            </span>
                            <span className="block text-xs text-rose-600 truncate">
                              {b.serviceName[lang]} · {b.stylistName}
                            </span>
                            <span dir="ltr" className="inline-flex items-center gap-1 text-xs text-rose-600">
                              <Phone className="w-3 h-3" strokeWidth={1.8} />
                              {b.clientPhone}
                            </span>
                          </span>
                          <StatusBadge status={b.status} />
                        </button>
                      ))}
                    </div>
                  )}

                  <a
                    href="/#booking"
                    className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-cream-200 text-sm font-medium text-rose-600 hover:text-rose-800 transition-colors"
                  >
                    {t('nav.booking')}
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showWaiting && (
        <PendingSheet
          bookings={waiting}
          onOpen={(booking) => {
            setShowWaiting(false);
            setSheet({ mode: 'edit', booking });
          }}
          onClose={() => setShowWaiting(false)}
        />
      )}
      {sheet && <BookingSheet key={JSON.stringify(sheet)} state={sheet} onClose={() => setSheet(null)} />}
    </section>
  );
}

/** Staff of another salon must never see this salon's schedule: the gate wraps the whole body. */
export function Schedule({ userId }: { userId: string }) {
  return (
    <SalonGate userId={userId}>
      <ScheduleBody />
    </SalonGate>
  );
}
