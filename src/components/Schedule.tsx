import { useMemo } from 'react';
import {
  Clock,
  Check,
  Phone,
  User,
  TrendingUp,
  CalendarDays,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import {
  todayAppointments,
  OPENING_HOUR,
  CLOSING_HOUR,
  type Appointment,
} from '../data/appointments';
import { formatPrice, formatDuration, formatLongDate } from '../data/formatters';
import { Thread } from './Thread';
import { Badge } from './Badge';

const HOUR_HEIGHT = 64; // px per hour in timeline

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function AppointmentBlock({ apt }: { apt: Appointment }) {
  const { lang, t } = useLang();
  const start = timeToMinutes(apt.time);
  const top = ((start - OPENING_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = (apt.duration / 60) * HOUR_HEIGHT - 4;

  return (
    <div
      className={`absolute left-2 right-2 rounded-xl border p-2.5 overflow-hidden transition-all duration-200 ease-silk hover:shadow-soft hover:z-10 ${
        apt.status === 'confirmed'
          ? 'bg-rose-50 border-rose-200'
          : 'bg-amber-50 border-amber-200'
      }`}
      style={{ top: `${top}px`, height: `${height}px` }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs font-semibold text-rose-800 truncate">
          {apt.clientName}
        </span>
        {apt.status === 'confirmed' ? (
          <Badge variant="confirmed" className="flex-shrink-0">
            <Check className="w-3 h-3" strokeWidth={2.5} />
            {t('schedule.confirmed')}
          </Badge>
        ) : (
          <Badge variant="pending" className="flex-shrink-0">
            <Clock className="w-3 h-3" strokeWidth={2} />
            {t('schedule.pending')}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-rose-500 truncate mt-0.5">
        {apt.serviceName[lang]}
      </p>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-rose-400">
        <span className="flex items-center gap-0.5">
          <User className="w-2.5 h-2.5" strokeWidth={2} />
          {apt.stylistName}
        </span>
        <span>·</span>
        <span>{formatPrice(apt.price, lang)}</span>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-cream-200 shadow-soft">
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${bg} flex-shrink-0`}>
        <Icon className={`w-6 h-6 ${color}`} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-display font-semibold text-rose-800 leading-none">
          {value}
        </p>
        <p className="text-xs text-rose-500/70 mt-1">{label}</p>
      </div>
    </div>
  );
}

export function Schedule() {
  const { lang, t } = useLang();
  const now = new Date();

  const sorted = useMemo(
    () => [...todayAppointments].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)),
    []
  );

  const totalRevenue = sorted.reduce((sum, a) => sum + a.price, 0);
  const totalMinutes = sorted.reduce((sum, a) => sum + a.duration, 0);
  const operatingMinutes = (CLOSING_HOUR - OPENING_HOUR) * 60;
  const occupationRate = Math.round((totalMinutes / operatingMinutes) * 100);

  // Next upcoming appointment
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const upcoming = sorted.find((a) => timeToMinutes(a.time) >= nowMinutes);

  const hours = Array.from({ length: CLOSING_HOUR - OPENING_HOUR + 1 }, (_, i) => OPENING_HOUR + i);

  return (
    <section id="schedule" className="relative py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <Thread variant="accent" className="w-24 h-5 text-rose-400 mx-auto mb-4" />
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-rose-800 mb-2">
            {t('schedule.title')}
          </h2>
          <p className="text-rose-500/80 text-lg">{t('schedule.subtitle')}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <StatCard
            icon={CalendarDays}
            label={t('schedule.appointments')}
            value={String(sorted.length)}
            color="text-rose-600"
            bg="bg-rose-100"
          />
          <StatCard
            icon={TrendingUp}
            label={t('schedule.revenue')}
            value={formatPrice(totalRevenue, lang)}
            color="text-sage-600"
            bg="bg-sage-100"
          />
          <StatCard
            icon={Activity}
            label={t('schedule.occupation')}
            value={`${occupationRate}%`}
            color="text-gold-600"
            bg="bg-gold-100"
          />
          <StatCard
            icon={Clock}
            label={t('schedule.nextAppt')}
            value={upcoming ? upcoming.time : '—'}
            color="text-amber-600"
            bg="bg-amber-100"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Timeline */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-semibold text-rose-800">
                  {formatLongDate(now, lang)}
                </h3>
                <span className="text-sm text-rose-400">
                  {sorted.length} {t('schedule.appointments')}
                </span>
              </div>

              {/* Timeline grid */}
              <div className="relative" style={{ height: `${(CLOSING_HOUR - OPENING_HOUR) * HOUR_HEIGHT}px` }}>
                {/* Hour lines */}
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 flex items-start"
                    style={{ top: `${i * HOUR_HEIGHT}px` }}
                  >
                    <span className="text-xs text-cream-500 w-12 flex-shrink-0 -mt-1.5">
                      {String(h).padStart(2, '0')}:00
                    </span>
                    <div className="flex-1 border-t border-cream-200" />
                  </div>
                ))}

                {/* Current time indicator */}
                {now.getHours() >= OPENING_HOUR && now.getHours() < CLOSING_HOUR && (
                  <div
                    className="absolute left-12 right-0 flex items-center z-20 pointer-events-none"
                    style={{ top: `${((nowMinutes - OPENING_HOUR * 60) / 60) * HOUR_HEIGHT}px` }}
                  >
                    <div className="w-2 h-2 rounded-full bg-rose-500 -ml-1" />
                    <div className="flex-1 border-t-2 border-rose-500/60" />
                  </div>
                )}

                {/* Appointments */}
                <div className="absolute left-12 right-0 top-0 bottom-0">
                  {sorted.map((apt) => (
                    <AppointmentBlock key={apt.id} apt={apt} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar — next appointment + list */}
          <div className="space-y-6">
            {/* Next appointment highlight */}
            <div className="bg-gradient-to-br from-rose-600 to-rose-800 rounded-3xl p-6 text-cream-50 shadow-lift">
              <p className="text-xs uppercase tracking-wider text-cream-200/70 mb-3">
                {t('schedule.nextAppt')}
              </p>
              {upcoming ? (
                <>
                  <p className="font-display text-3xl font-semibold mb-1">{upcoming.time}</p>
                  <p className="text-sm text-cream-200/90 mb-4">
                    {upcoming.clientName} · {upcoming.serviceName[lang]}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-cream-200/70">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" strokeWidth={1.8} />
                      {upcoming.stylistName}
                    </span>
                    <span>·</span>
                    <span>{formatDuration(upcoming.duration, lang)}</span>
                    <span>·</span>
                    <span>{formatPrice(upcoming.price, lang)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-cream-200/70">{t('schedule.noUpcoming')}</p>
              )}
            </div>

            {/* Compact list */}
            <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-5">
              <h3 className="font-display text-base font-semibold text-rose-800 mb-4">
                {formatLongDate(now, lang)}
              </h3>
              <div className="space-y-2.5">
                {sorted.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-cream-50 transition-colors"
                  >
                    <div className="flex flex-col items-center justify-center w-12 flex-shrink-0">
                      <span className="text-sm font-semibold text-rose-700">{apt.time}</span>
                      <span className="text-[10px] text-cream-500">
                        {formatDuration(apt.duration, lang)}
                      </span>
                    </div>
                    <Thread variant="connector" className="h-10 text-rose-300" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-rose-800 truncate">
                        {apt.clientName}
                      </p>
                      <p className="text-xs text-rose-400 truncate">
                        {apt.serviceName[lang]}
                      </p>
                    </div>
                    {apt.status === 'confirmed' ? (
                      <Badge variant="confirmed">
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                      </Badge>
                    ) : (
                      <Badge variant="pending">
                        <Clock className="w-3 h-3" strokeWidth={2} />
                      </Badge>
                    )}
                  </div>
                ))}
              </div>

              {/* Book CTA */}
              <a
                href="#booking"
                className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-cream-200 text-sm font-medium text-rose-600 hover:text-rose-800 transition-colors"
              >
                {t('nav.booking')}
                <ArrowRight className="w-4 h-4" strokeWidth={1.8} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
