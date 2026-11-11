import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { formatLongDate } from '../../data/formatters';
import { toSettingsError, useAddClosedDates, useClosedDates, useDeleteClosedDates } from '../../data/salonSettings';
import { AffectedBookings } from './AffectedBookings';

const ERROR_KEYS = ['invalid_dates', 'not_authorized'];

const parseYmd = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function ClosedDatesSettings() {
  const { t, lang } = useLang();
  const { data: closed = [] } = useClosedDates();
  const add = useAddClosedDates();
  const del = useDeleteClosedDates();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAffected, setShowAffected] = useState(false);

  const fail = (err: unknown) => {
    const code = toSettingsError(err);
    setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
  };

  const submit = () => {
    setShowAffected(false);
    if (!from) return setError(t('settings.error.invalid_dates'));
    setError(null);
    add.mutate(
      { from, to: to || from, label: label.trim() || null },
      {
        onSuccess: () => {
          setFrom('');
          setTo('');
          setLabel('');
          setShowAffected(true);
        },
        onError: fail,
      }
    );
  };

  return (
    <div className="space-y-5">
      {showAffected && <AffectedBookings />}
      <section className="card p-4 space-y-3">
        {closed.length === 0 ? (
          <p className="text-sm text-rose-600">{t('settings.closed.none')}</p>
        ) : (
          <ul className="space-y-2">
            {closed.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-rose-800">
                <span data-testid="closed-range" className="min-w-0">
                  {c.label && <span className="block font-medium truncate">{c.label}</span>}
                  <span className="block text-sm">
                    {c.from === c.to
                      ? formatLongDate(parseYmd(c.from), lang)
                      : `${formatLongDate(parseYmd(c.from), lang)} → ${formatLongDate(parseYmd(c.to), lang)}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn-ghost btn-sm shrink-0"
                  aria-label={t('settings.closed.delete')}
                  disabled={del.isPending}
                  onClick={() => {
                    setShowAffected(false);
                    del.mutate({ id: c.id }, { onError: fail });
                  }}
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.8} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        className="card p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="closed-from" className="label">{t('settings.closed.from')}</label>
            <input id="closed-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="closed-to" className="label">{t('settings.closed.to')}</label>
            <input id="closed-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="closed-label" className="label">{t('settings.closed.label')}</label>
          <input
            id="closed-label"
            className="input"
            maxLength={60}
            placeholder={t('settings.closed.placeholder')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={add.isPending}>{t('settings.closed.add')}</button>
      </form>
    </div>
  );
}
