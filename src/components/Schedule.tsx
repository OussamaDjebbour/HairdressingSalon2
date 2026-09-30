import { useMemo, useState } from 'react';
import {
  Clock, Check, X, User, Phone, TrendingUp, CalendarDays, Activity, ArrowRight,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { OPENING_HOUR, CLOSING_HOUR } from '../data/hours';
import { toYmd } from '../data/bookings';
import {
  algiersToday, formatAlgiersTime, isNotAuthorized, useAdminBookings, useSetBookingStatus,
  type AdminBooking, type BookingStatus,
} from '../data/admin';
import { formatPrice, formatDuration, formatLongDate } from '../data/formatters';
import { DataError } from './DataError';
import { Thread } from './Thread';
import { Badge } from './Badge';

const HOUR_HEIGHT = 64; // px per hour in timeline

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function startMinutes(b: AdminBooking): number {
  return timeToMinutes(formatAlgiersTime(b.startsAt));
}

function durationMinutes(b: AdminBooking): number {
  return Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);
}

function StatusBadge({ status, compact = false }: { status: BookingStatus; compact?: boolean }) {
  const { t } = useLang();
  if (status === 'confirmed') {
    return (
      <Badge variant="confirmed" className="flex-shrink-0">
        <Check className="w-3 h-3" strokeWidth={2.5} />
        {!compact && t('schedule.confirmed')}
      </Badge>
    );
  }
  if (status === 'cancelled') {
    return (
      <Badge variant="cancelled" className="flex-shrink-0">
        <X className="w-3 h-3" strokeWidth={2.5} />
        {!compact && t('schedule.cancelled')}
      </Badge>
    );
  }
  return (
    <Badge variant="pending" className="flex-shrink-0">
      <Clock className="w-3 h-3" strokeWidth={2} />
      {!compact && t('schedule.pending')}
    </Badge>
  );
}

function AppointmentBlock({ booking }: { booking: AdminBooking }) {
  const { lang } = useLang();
  const top = ((startMinutes(booking) - OPENING_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = (durationMinutes(booking) / 60) * HOUR_HEIGHT - 4;

  return (
    <div
      className={`absolute left-2 right-2 rounded-xl border p-2.5 overflow-hidden transition-all duration-200 ease-silk hover:shadow-soft hover:z-10 ${
        booking.status === 'confirmed' ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'
      }`}
      style={{ top: `${top}px`, height: `${height}px` }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs font-semibold text-rose-800 truncate">{booking.clientName}</span>
        <StatusBadge status={booking.status} />
      </div>
      <p className="text-[11px] text-rose-600 truncate mt-0.5">{booking.serviceName[lang]}</p>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-rose-600">
        <span className="flex items-center gap-0.5">
          <User className="w-2.5 h-2.5" strokeWidth={2} />
          {booking.stylistName}
        </span>
        <span>·</span>
        <span>{formatPrice(booking.price, lang)}</span>
      </div>
    </div>
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

export function Schedule() {
  const { lang, t } = useLang();
  const [day, setDay] = useState(() => algiersToday());
  const bookingsQuery = useAdminBookings(day);
  const setStatus = useSetBookingStatus();
  const [actionError, setActionError] = useState<string | null>(null);

  const now = new Date();
  const isToday = toYmd(day) === toYmd(algiersToday());

  const all = useMemo(
    () => [...(bookingsQuery.data ?? [])].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [bookingsQuery.data]
  );
  const active = all.filter((b) => b.status !== 'cancelled');

  const totalRevenue = active.reduce((sum, b) => sum + b.price, 0);
  const totalMinutes = active.reduce((sum, b) => sum + durationMinutes(b), 0);
  const operatingMinutes = (CLOSING_HOUR - OPENING_HOUR) * 60;
  const occupationRate = Math.round((totalMinutes / operatingMinutes) * 100);

  const nowMinutes = timeToMinutes(formatAlgiersTime(now));
  const upcoming = isToday ? active.find((b) => startMinutes(b) >= nowMinutes) : active[0];

  const hours = Array.from({ length: CLOSING_HOUR - OPENING_HOUR + 1 }, (_, i) => OPENING_HOUR + i);

  const shiftDay = (delta: number) => {
    setDay((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() + delta);
      return next;
    });
  };

  const changeStatus = (booking: AdminBooking, status: 'confirmed' | 'cancelled') => {
    if (status === 'cancelled' && !window.confirm(t('admin.cancelConfirm'))) return;
    setActionError(null);
    setStatus.mutate(
      { id: booking.id, status },
      {
        onError: (err) => {
          const message = (err as { message?: unknown })?.message;
          setActionError(message === 'slot_taken' ? t('admin.slotTaken') : t('admin.actionError'));
        },
      }
    );
  };

  if (bookingsQuery.isError && isNotAuthorized(bookingsQuery.error)) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.notAuthorized')}</p>;
  }

  return (
    <section id="schedule" className="relative py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="eyebrow eyebrow-center justify-center mx-auto mb-4">{t('schedule.kicker')}</p>
          <h2 className="font-display font-semibold text-rose-900 mb-2 text-[clamp(2rem,4vw,3rem)]">
            {t('schedule.title')}
          </h2>
          <p className="text-rose-600 text-lg">{t('schedule.subtitle')}</p>
        </div>

        {/* Day picker */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <button onClick={() => shiftDay(-1)} className="btn-ghost btn-sm" aria-label={t('admin.prevDay')}>
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
          </button>
          <span className="font-display text-lg font-semibold text-rose-800 min-w-[12rem] text-center">
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

        {actionError && (
          <p role="alert" className="max-w-xl mx-auto mb-6 rounded-xl border border-rust-200 bg-rust-50 px-4 py-3 text-sm text-rust-700 text-center">
            {actionError}
          </p>
        )}

        {bookingsQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
          </div>
        ) : bookingsQuery.isError ? (
          <DataError onRetry={() => bookingsQuery.refetch()} />
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <StatCard icon={CalendarDays} label={t('schedule.appointments')} value={String(active.length)} />
              <StatCard icon={TrendingUp} label={t('schedule.revenue')} value={formatPrice(totalRevenue, lang)} />
              <StatCard icon={Activity} label={t('schedule.occupation')} value={`${occupationRate}%`} />
              <StatCard
                icon={Clock}
                label={t('schedule.nextAppt')}
                value={upcoming ? formatAlgiersTime(upcoming.startsAt) : '—'}
              />
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Timeline */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-lg font-semibold text-rose-800">{formatLongDate(day, lang)}</h3>
                    <span className="text-sm text-rose-600">
                      {active.length} {t('schedule.appointments')}
                    </span>
                  </div>

                  <div className="relative" style={{ height: `${(CLOSING_HOUR - OPENING_HOUR) * HOUR_HEIGHT}px` }}>
                    {hours.map((h, i) => (
                      <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: `${i * HOUR_HEIGHT}px` }}>
                        <span className="text-xs text-rose-600 w-12 flex-shrink-0 -mt-1.5">
                          {String(h).padStart(2, '0')}:00
                        </span>
                        <div className="flex-1 border-t border-cream-200" />
                      </div>
                    ))}

                    {isToday && nowMinutes >= OPENING_HOUR * 60 && nowMinutes < CLOSING_HOUR * 60 && (
                      <div
                        className="absolute left-12 right-0 flex items-center z-20 pointer-events-none"
                        style={{ top: `${((nowMinutes - OPENING_HOUR * 60) / 60) * HOUR_HEIGHT}px` }}
                      >
                        <div className="w-2 h-2 rounded-full bg-rose-500 -ml-1" />
                        <div className="flex-1 border-t-2 border-rose-500/60" />
                      </div>
                    )}

                    <div className="absolute left-12 right-0 top-0 bottom-0">
                      {active.map((b) => (
                        <AppointmentBlock key={b.id} booking={b} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar — next appointment + list with actions */}
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
                    <div className="space-y-2.5">
                      {all.map((b) => (
                        <div key={b.id} className="p-2.5 rounded-xl hover:bg-cream-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center justify-center w-12 flex-shrink-0">
                              <span className="text-sm font-semibold text-rose-700">{formatAlgiersTime(b.startsAt)}</span>
                              <span className="text-[10px] text-rose-600">{formatDuration(durationMinutes(b), lang)}</span>
                            </div>
                            <Thread variant="connector" className="h-10 text-rose-300" />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${b.status === 'cancelled' ? 'text-cream-500 line-through' : 'text-rose-800'}`}>
                                {b.clientName}
                              </p>
                              <p className="text-xs text-rose-600 truncate">
                                {b.serviceName[lang]} · {b.stylistName}
                              </p>
                              <a href={`tel:${b.clientPhone}`} dir="ltr" className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800">
                                <Phone className="w-3 h-3" strokeWidth={1.8} />
                                {b.clientPhone}
                              </a>
                            </div>
                            <StatusBadge status={b.status} compact />
                          </div>
                          {b.status !== 'cancelled' && (
                            <div className="flex justify-end gap-2 mt-2">
                              {b.status === 'pending' && (
                                <button
                                  onClick={() => changeStatus(b, 'confirmed')}
                                  disabled={setStatus.isPending}
                                  className="btn-secondary btn-sm"
                                >
                                  <Check className="w-3.5 h-3.5" strokeWidth={2} />
                                  {t('admin.confirm')}
                                </button>
                              )}
                              <button
                                onClick={() => changeStatus(b, 'cancelled')}
                                disabled={setStatus.isPending}
                                className="btn-ghost btn-sm"
                              >
                                <X className="w-3.5 h-3.5" strokeWidth={2} />
                                {t('admin.cancel')}
                              </button>
                            </div>
                          )}
                        </div>
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
          </>
        )}
      </div>
    </section>
  );
}
