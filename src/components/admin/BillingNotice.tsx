import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { formatDayMonth } from '../../data/formatters';
import { dayOf, useAdminBilling } from '../../data/billing';

/**
 * The owner's subscription notice, above the agenda and Réglages: a quiet line a few days before the paid
 * period ends, a warning during the grace days, an alert once online booking is paused. Nothing otherwise
 * (paid ahead, not billed, the demo, or the question failed).
 */
export function BillingNotice() {
  const { t, lang } = useLang();
  const { data } = useAdminBilling();
  if (!data || !data.paid_until || !data.paused_from) return null;
  const fill = (key: string) =>
    t(key)
      .replace('{date}', formatDayMonth(dayOf(data.paid_until!), lang))
      .replace('{pause}', formatDayMonth(dayOf(data.paused_from!), lang));

  const box = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3';
  if (data.state === 'soon') {
    return (
      <div className={box}>
        <p className="flex items-start gap-2 text-sm text-rose-900/70">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
          {fill('admin.billing.soon')}
        </p>
      </div>
    );
  }
  if (data.state === 'grace') {
    return (
      <div className={box}>
        <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
          {fill('admin.billing.grace')}
        </p>
      </div>
    );
  }
  if (data.state === 'paused') {
    return (
      <div className={box}>
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rust-200 bg-rust-50 px-3 py-2 text-sm text-rust-700">
          <AlertOctagon className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
          {fill('admin.billing.paused')}
        </p>
      </div>
    );
  }
  return null;
}
