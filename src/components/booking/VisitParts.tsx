import { useLang } from '../../context/LanguageContext';
import { formatPrice } from '../../data/formatters';
import type { Service } from '../../data/types';

export interface VisitPart {
  time: string;
  service: Service;
  stylistName: string;
}

/** The parts of a visit, one per line ("10:00  Coupe & Brushing · Amina"), and the total price if given. */
export function VisitParts({ parts, total }: { parts: VisitPart[]; total?: number }) {
  const { lang, t } = useLang();
  return (
    <div>
      <ol className="space-y-2">
        {parts.map(({ time, service, stylistName }) => (
          <li key={service.id} className="flex items-baseline gap-3 text-sm">
            <span className="flex-shrink-0 w-12 font-semibold text-rose-800 tabular-nums" dir="ltr">{time}</span>{' '}
            <span className="min-w-0 text-rose-700">
              <span className="font-medium text-rose-800">{service.name[lang]}</span>
              {' · '}
              {stylistName}
            </span>
          </li>
        ))}
      </ol>
      {total !== undefined && (
        <div className="border-t border-rose-900/10 mt-3 pt-3 flex justify-between items-center gap-4">
          <span className="text-sm font-semibold text-rose-700">{t('booking.summary.total')}</span>{' '}
          <span className="text-lg font-display font-semibold text-rose-800">{formatPrice(total, lang)}</span>
        </div>
      )}
    </div>
  );
}
