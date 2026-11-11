import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Clock, Check, X, User, Phone, TrendingUp, CalendarDays, Activity, ArrowRight,
  ChevronLeft, ChevronRight, Plus, BellRing,
} from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { toYmd } from '../data/bookings';
import {
  algiersToday, formatAlgiersTime, isNotAuthorized, useAdminBookings, useMySalon,
  type AdminBooking, type BookingStatus,
} from '../data/admin';
import { SALON_ID } from '../data/salon';
import { useStylists } from '../data/queries';
import { formatPrice, formatDuration, formatLongDate } from '../data/formatters';
import { CLOSING_HOUR, OPENING_HOUR } from '../data/hours';
import { dayOccupancy, isClosedDay, minutesToTime, salonDate, salonMinutes, weekDays } from '../data/week';
import { DataError } from './DataError';
import { Thread } from './Thread';
import { Badge } from './Badge';
import { WeekStrip } from './admin/WeekStrip';
import { DayColumns } from './admin/DayColumns';
import { BookingSheet, type SheetState } from './admin/BookingSheet';
import { NotificationsCard } from './admin/NotificationsCard';

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

function StatCard({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-cream-200 shadow-soft">
      <div className="flex items-center justify-center w-11 h-11 rounded-full bg-cream-100 border border-gold-200/70 flex-shrink-0">
        <Icon className="w-5 h-5 text-gold-600" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-display font-semibold text-rose-900 leading-none">{value}</p>
        <p className="text-xs text-rose-600 mt-1">{label}</p>
      </div>
    </div>
  );
}

/** First free half-hour for a stylist on a day (from now if it's today), else opening time. */
function firstFreeTime(bookings: AdminBooking[], stylistId: string, isToday: boolean): string {
  const now = isToday ? salonMinutes(new Date()) : 0;
  for (let min = OPENING_HOUR * 60; min + 30 <= CLOSING_HOUR * 60; min += 30) {
    if (min < now) continue;
    const busy = bookings.some((b) => {
      if (b.stylistId !== stylistId || b.status === 'cancelled') return false;
      const start = salonMinutes(b.startsAt);
      return start < min + 30 && start + durationMinutes(b) > min;
    });
    if (!busy) return minutesToTime(min);
  }
  return minutesToTime(OPENING_HOUR * 60);
}

export function Schedule({ userId }: { userId: string }) {
  const { lang, t } = useLang();
  // A notification opens /admin?day=YYYY-MM-DD&booking=<id>: start on that day, then open the booking.
  const [searchParams, setSearchParams] = useSearchParams();
  const [day, setDay] = useState(() => parseYmd(searchParams.get('day')) ?? algiersToday());
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const stylists = useStylists().data ?? [];
  const mySalon = useMySalon(userId);

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
  const totalRevenue = active.reduce((sum, b) => sum + b.price, 0);
  const occupationRate = Math.round(dayOccupancy(all, day, stylists.length) * 100);
  const upcoming = isToday ? active.find((b) => b.startsAt > now) : active[0];

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
    const stylistId = stylists[0]?.id;
    if (!stylistId) return;
    // A closed day (Sunday/Monday) can only fail: start on the next open day instead.
    let date = day;
    while (isClosedDay(date)) date = addDays(date, 1);
    const onDate = (weekQuery.data ?? []).filter((b) => toYmd(salonDate(b.startsAt)) === toYmd(date));
    setSheet({ mode: 'add', stylistId, date, time: firstFreeTime(onDate, stylistId, toYmd(date) === toYmd(today)) });
  };

  // Staff of another salon must never see this salon's schedule.
  if (mySalon.isLoading) return <section id="schedule" className="py-20" aria-busy="true" />;
  if (mySalon.isError && isNotAuthorized(mySalon.error)) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.notAuthorized')}</p>;
  }
  if (mySalon.data !== undefined && mySalon.data !== SALON_ID) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.otherSalon')}</p>;
  }

  if (weekQuery.isError && isNotAuthorized(weekQuery.error)) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.notAuthorized')}</p>;
  }

  return (
    <section id="schedule" className="relative py-10 lg:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="eyebrow eyebrow-center justify-center mx-auto mb-3">{t('schedule.kicker')}</p>
          <h2 className="font-display font-semibold text-rose-900 text-[clamp(1.75rem,4vw,3rem)]">{t('schedule.title')}</h2>
        </div>

        {/* Day picker */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          <button onClick={() => shiftDay(-1)} className="btn-ghost btn-sm" aria-label={t('admin.prevDay')}>
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
          </button>
          <span className="font-display text-lg font-semibold text-rose-800 sm:min-w-[11rem] text-center">
            {formatLongDate(day, lang)}
          </span>
          <button onClick={() => shiftDay(1)} className="btn-ghost btn-sm" aria-label={t('admin.nextDay')}>
            <ChevronRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
          </button>
          {!isToday && (
            <button onClick={() => setDay(algiersToday())} className="btn-secondary btn-sm">
              {t('schedule.today')}
            </button>
          )}
        </div>

        {waiting.length > 0 && (
          <div className="flex justify-center mb-4">
            <button
              type="button"
              onClick={() => setDay(salonDate(waiting[0].startsAt))}
              className="inline-flex items-center gap-2 rounded-full bg-amber-100 border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-200 transition-colors"
            >
              <BellRing className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
              {t('schedule.pendingCount').replace('{n}', String(waiting.length))}
            </button>
          </div>
        )}

        <NotificationsCard />

        <div className="max-w-3xl mx-auto mb-6">
          <WeekStrip day={day} bookings={weekQuery.data ?? []} stylistCount={stylists.length} onSelect={setDay} />
        </div>

        {weekQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
          </div>
        ) : weekQuery.isError ? (
          <DataError onRetry={() => weekQuery.refetch()} />
        ) : (
          <div className="flex flex-col">
            {/* Stats row: under the day on phones (the columns come first), above it on large screens */}
            <div className="order-2 lg:order-1 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 lg:mt-0 lg:mb-6">
              <StatCard icon={CalendarDays} label={t('schedule.appointments')} value={String(active.length)} />
              <StatCard icon={TrendingUp} label={t('schedule.revenue')} value={formatPrice(totalRevenue, lang)} />
              <StatCard icon={Activity} label={t('schedule.occupation')} value={`${occupationRate}%`} />
              <StatCard
                icon={Clock}
                label={t('schedule.nextAppt')}
                value={upcoming ? formatAlgiersTime(upcoming.startsAt) : '—'}
              />
            </div>

            <div className="order-1 lg:order-2 grid lg:grid-cols-3 gap-6">
              {/* Day: one column per stylist */}
              <div className="lg:col-span-2 bg-white rounded-3xl shadow-card border border-cream-200 p-3 sm:p-6">
                <DayColumns
                  day={day}
                  stylists={stylists}
                  bookings={all}
                  onSlotTap={(stylistId, time) => setSheet({ mode: 'add', stylistId, date: day, time })}
                  onBookingTap={(booking) => setSheet({ mode: 'edit', booking })}
                />
              </div>

              {/* Side list (includes cancelled bookings, which can be restored from the sheet) */}
              <div className="space-y-6">
                <div className="relative bg-gradient-to-br from-rose-800 to-rose-900 rounded-3xl p-6 text-cream-50 shadow-lift overflow-hidden">
                  <div className="absolute top-0 inset-x-0 hairline opacity-50" />
                  <p className="text-[0.7rem] uppercase tracking-[0.2em] text-gold-300 mb-3">{t('schedule.nextAppt')}</p>
                  {upcoming ? (
                    <>
                      <p className="font-display text-3xl font-semibold mb-1">{formatAlgiersTime(upcoming.startsAt)}</p>
                      <p className="text-sm text-cream-200/90 mb-4">
                        {upcoming.clientName} · {upcoming.serviceName[lang]}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-cream-200/70">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" strokeWidth={1.8} />
                          {upcoming.stylistName}
                        </span>
                        <span>·</span>
                        <span>{formatDuration(durationMinutes(upcoming), lang)}</span>
                        <span>·</span>
                        <span>{formatPrice(upcoming.price, lang)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-cream-200/70">{t('schedule.noUpcoming')}</p>
                  )}
                </div>

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

      {/* Add a booking (WhatsApp, phone, walk-in) */}
      <button
        type="button"
        onClick={openAdd}
        aria-label={t('admin.sheet.addTitle')}
        className="fixed bottom-6 end-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-rose-800 text-cream-50 shadow-lift hover:bg-rose-900 transition-colors"
      >
        <Plus className="w-6 h-6" strokeWidth={2} />
      </button>

      {sheet && <BookingSheet key={JSON.stringify(sheet)} state={sheet} onClose={() => setSheet(null)} />}
    </section>
  );
}
