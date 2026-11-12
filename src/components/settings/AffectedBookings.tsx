import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { formatAlgiersTime } from '../../data/admin';
import { toYmd } from '../../data/bookings';
import { formatLongDate } from '../../data/formatters';
import { useAffectedBookings } from '../../data/salonSettings';
import { salonDate } from '../../data/week';

/** Upcoming bookings that no longer fit the settings, each linking to its sheet in the schedule. Nothing when none. */
export function AffectedBookings() {
  const { t, lang } = useLang();
  const { data } = useAffectedBookings(true);
  if (!data || data.length === 0) return null;

  return (
    <section className="card p-4 mb-5 border-amber-300 bg-amber-50" role="status">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" strokeWidth={1.8} aria-hidden />
        <p className="text-sm font-medium text-amber-900">{t('settings.affected.title')}</p>
      </div>
      <ul className="mt-3 divide-y divide-amber-200">
        {data.map((b) => {
          const day = salonDate(b.startsAt);
          return (
            <li key={b.id}>
              <Link
                to={`/admin?day=${toYmd(day)}&booking=${b.id}`}
                className="block py-2.5 text-sm text-rose-800 hover:underline"
              >
                <span className="font-semibold">{b.clientName}</span>
                <span className="block text-rose-700">
                  {formatLongDate(day, lang)} · {formatAlgiersTime(b.startsAt)}
                </span>
                <span className="block text-amber-800">{t(`settings.affected.${b.reason}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
