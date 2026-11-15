import { AlertCircle } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { nameInText } from '../../data/formatters';
import { joinNames } from '../../data/visit';
import type { Service } from '../../data/types';

const box = 'mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 text-start';
const link = 'tap font-medium text-rose-800 underline underline-offset-2 hover:text-rose-900';

/** The parts that can't be done at all on the chosen day, each with "Retirer" (and "Changer de coiffeuse" if one was chosen). */
export function DayMissing({ parts, onRemove, onChangeStylist }: {
  parts: { service: Service; stylistName: string | null }[];
  onRemove(index: number): void;
  onChangeStylist(): void;
}) {
  const { lang, t } = useLang();
  if (parts.length === 0) return null;
  return (
    <ul role="status" className={`${box} space-y-2`}>
      {parts.map(({ service, stylistName }, i) => (
        <li key={service.id}>
          <p>
            {(stylistName
              ? t('booking.visit.missingDayWith').replace('{stylist}', nameInText(stylistName, lang))
              : t('booking.visit.missingDay')
            ).replace('{service}', service.name[lang])}
          </p>
          <div className="flex flex-wrap gap-x-4">
            <button type="button" className={link} onClick={() => onRemove(i)}>{t('booking.visit.remove')}</button>
            {stylistName && (
              <button type="button" className={link} onClick={onChangeStylist}>{t('booking.visit.changeStylist')}</button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Some parts can't be placed at this time (or were just taken): book the others from it, or pick another time. */
export function TimeMissing({ names, time, kind, onBookOthers, onOtherTime }: {
  names: string[];
  time: string;
  kind: 'unavailable' | 'taken';
  onBookOthers(): void;
  onOtherTime(): void;
}) {
  const { t } = useLang();
  const list = joinNames(names);
  const text =
    kind === 'taken'
      ? t('booking.visit.justTaken').replace('{service}', list)
      : t(names.length > 1 ? 'booking.visit.missingAtMany' : 'booking.visit.missingAt')
          .replace('{services}', list)
          .replace('{time}', time);
  return (
    <div className={box}>
      <p role="alert" className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
        {text}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" className="btn-primary btn-sm" onClick={onBookOthers}>{t('booking.visit.bookOthers')}</button>
        <button type="button" className="btn-secondary btn-sm" onClick={onOtherTime}>{t('booking.visit.otherTime')}</button>
      </div>
    </div>
  );
}
