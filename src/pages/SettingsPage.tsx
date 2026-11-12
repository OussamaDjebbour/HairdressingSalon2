import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { useLang, type Lang } from '../context/LanguageContext';
import { useAllServices, useAllStylists } from '../data/queries';
import { useClosedDates, useSalonHours } from '../data/salonSettings';
import { algiersToday } from '../data/admin';
import { toYmd } from '../data/bookings';
import { formatDayMonth } from '../data/formatters';
import { groupHours } from '../data/hours';
import { minutesToTime } from '../data/week';
import type { ClosedDates, SalonHours, Weekday } from '../data/types';
import { useLogout } from '../lib/useLogout';
import { SettingsLayout } from '../components/settings/SettingsLayout';
import { NotificationsCard } from '../components/admin/NotificationsCard';

// Sunday first, as in the owner's calendar ("dim., lun.").
const CLOSED_DAY_ORDER: Weekday[] = [7, 1, 2, 3, 4, 5, 6];

function hoursSummary(hours: SalonHours, t: (k: string) => string, lang: Lang): string {
  const open = groupHours(hours).find((g) => g.hours);
  if (!open?.hours) return t('settings.hoursAllClosed');
  const range = `${minutesToTime(open.hours.opens)}–${minutesToTime(open.hours.closes)}`;
  const closedDays = CLOSED_DAY_ORDER.filter((wd) => !hours[wd]).map((wd) => t(`settings.dayShort.${wd}`));
  if (closedDays.length === 0) return range;
  const sep = lang === 'ar' ? '، ' : ', ';
  return `${range} · ${t('settings.hoursClosed').replace('{days}', closedDays.join(sep))}`;
}

function nextClosedSummary(closed: ClosedDates[], t: (k: string) => string, lang: Lang): string {
  const today = algiersToday();
  const todayYmd = toYmd(today);
  const next = closed
    .filter((c) => c.to >= todayYmd)
    .sort((a, b) => a.from.localeCompare(b.from))[0];
  if (!next) return t('settings.noneClosed');
  const [y, m, d] = (next.from > todayYmd ? next.from : todayYmd).split('-').map(Number);
  return t('settings.nextClosed').replace('{date}', formatDayMonth(new Date(y, m - 1, d), lang));
}

function Row({ to, label, summary }: { to: string; label: string; summary?: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3.5 min-h-[56px] border-b border-cream-200 last:border-b-0 hover:bg-cream-50 transition-colors"
    >
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-rose-900">{label}</span>
        {summary !== undefined && <span className="block text-sm text-rose-700/80 truncate">{summary}</span>}
      </span>
      <ChevronRight className="w-4 h-4 text-gold-600 flex-shrink-0 rtl:rotate-180" strokeWidth={1.8} aria-hidden="true" />
    </Link>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h2 className="text-xs uppercase tracking-[0.2em] text-gold-700 mb-2 px-1">{title}</h2>}
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { lang, t } = useLang();
  const services = useAllServices();
  const stylists = useAllStylists();
  const hours = useSalonHours();
  const closed = useClosedDates();
  const handleLogout = useLogout();

  return (
    <SettingsLayout title={t('settings.title')} backTo="/admin">
      <Group>
        <div className="card overflow-hidden !p-0">
          <Row
            to="/admin/settings/services"
            label={t('settings.services')}
            summary={services.data && t('settings.servicesSummary').replace('{n}', String(services.data.length))}
          />
          <Row
            to="/admin/settings/stylists"
            label={t('settings.stylists')}
            summary={stylists.data && t('settings.stylistsSummary').replace('{n}', String(stylists.data.length))}
          />
          <Row
            to="/admin/settings/hours"
            label={t('settings.hours')}
            summary={hours.data && hoursSummary(hours.data, t, lang)}
          />
          <Row
            to="/admin/settings/closed-dates"
            label={t('settings.closedDates')}
            summary={closed.data && nextClosedSummary(closed.data, t, lang)}
          />
          <Row to="/admin/settings/info" label={t('settings.info')} summary={t('settings.infoSummary')} />
        </div>
      </Group>

      <Group title={t('settings.account')}>
        <NotificationsCard />
        <button
          type="button"
          onClick={handleLogout}
          className="card w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] text-start font-medium text-rose-800 hover:bg-cream-50 transition-colors"
        >
          <LogOut className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} aria-hidden="true" />
          {t('admin.logout')}
        </button>
      </Group>
    </SettingsLayout>
  );
}
