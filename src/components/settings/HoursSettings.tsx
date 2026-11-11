import { useState } from 'react';
import { useLang } from '../../context/LanguageContext';
import { formatDayName } from '../../data/formatters';
import { toSettingsError, useSalonHours, useSetHours } from '../../data/salonSettings';
import type { DayHours, SalonHours, Weekday } from '../../data/types';
import { minutesToTime } from '../../data/week';
import { AffectedBookings } from './AffectedBookings';
import { QueryFallback } from './QueryFallback';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const ERROR_KEYS = ['invalid_hours', 'not_authorized'];
const STEP = 15;
const FIRST = 6 * 60;
const LAST = 23 * 60;
const DEFAULT_DAY: DayHours = { opens: 9 * 60, closes: 18 * 60 };

/** A date that falls on the given ISO weekday (2024-01-01 is a Monday), for day-name labels. */
const dateOfWeekday = (iso: Weekday) => new Date(2024, 0, iso);

const options = (current: number | undefined) => {
  const list: number[] = [];
  for (let m = FIRST; m <= LAST; m += STEP) list.push(m);
  if (current !== undefined && !list.includes(current)) list.push(current);
  return list.sort((a, b) => a - b);
};

export function HoursSettings() {
  const { t, lang } = useLang();
  const hoursQuery = useSalonHours();
  const save = useSetHours();
  const [draft, setDraft] = useState<SalonHours | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAffected, setShowAffected] = useState(false);

  const hours = draft ?? hoursQuery.data;
  if (!hours) return <QueryFallback queries={[hoursQuery]} />;

  const change = (day: Weekday, value: DayHours | null) => {
    setError(null);
    setShowAffected(false);
    setDraft({ ...hours, [day]: value });
  };

  const submit = () => {
    setError(null);
    if (WEEKDAYS.some((d) => hours[d] && hours[d]!.opens >= hours[d]!.closes)) {
      setError(t('settings.error.invalid_hours'));
      return;
    }
    save.mutate(hours, {
      onSuccess: () => {
        setDraft(null);
        setShowAffected(true);
      },
      onError: (err) => {
        const code = toSettingsError(err);
        setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
      },
    });
  };

  return (
    <div>
      {showAffected && <AffectedBookings />}
      <form
        className="card p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {WEEKDAYS.map((d) => {
          const h = hours[d];
          const name = formatDayName(dateOfWeekday(d), lang);
          return (
            <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 min-h-11">
              <button
                type="button"
                role="switch"
                aria-checked={!!h}
                aria-label={name}
                className={`${h ? 'btn-primary' : 'btn-secondary'} btn-sm w-28 justify-start`}
                onClick={() => change(d, h ? null : DEFAULT_DAY)}
              >
                {name}
              </button>
              {h ? (
                <div className="flex items-center gap-2">
                  <select
                    className="input w-24"
                    aria-label={`${name} · ${t('settings.hours.opens')}`}
                    value={h.opens}
                    onChange={(e) => change(d, { ...h, opens: Number(e.target.value) })}
                  >
                    {options(h.opens).map((m) => <option key={m} value={m}>{minutesToTime(m)}</option>)}
                  </select>
                  <span aria-hidden className="text-rose-600">–</span>
                  <select
                    className="input w-24"
                    aria-label={`${name} · ${t('settings.hours.closes')}`}
                    value={h.closes}
                    onChange={(e) => change(d, { ...h, closes: Number(e.target.value) })}
                  >
                    {options(h.closes).map((m) => <option key={m} value={m}>{minutesToTime(m)}</option>)}
                  </select>
                </div>
              ) : (
                <span className="text-sm text-rose-600">{t('settings.hours.closed')}</span>
              )}
            </div>
          );
        })}
        {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={save.isPending}>{t('settings.hours.save')}</button>
      </form>
    </div>
  );
}
