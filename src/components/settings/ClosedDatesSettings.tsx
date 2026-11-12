import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { toYmd } from '../../data/bookings';
import { formatLongDate } from '../../data/formatters';
import { toSettingsError, useAddClosedDates, useClosedDates, useDeleteClosedDates } from '../../data/salonSettings';
import { periodSchema } from '../../data/schemas';
import type { Period } from '../../data/period';
import { TextField } from '../form/TextField';
import { DateRangeField } from '../form/DateRangeField';
import { FormSummary } from '../form/FormSummary';
import { AffectedBookings } from './AffectedBookings';
import { QueryFallback, queriesReady } from './QueryFallback';

const ERROR_KEYS = ['invalid_dates', 'not_authorized'];

const closedSchema = z.object({
  period: periodSchema,
  label: z.string().trim().max(60, 'form.error.labelLength'),
});
type ClosedForm = { period: Period | null; label: string };

const parseYmd = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function ClosedDatesSettings() {
  const { t, lang } = useLang();
  const closedQuery = useClosedDates();
  const closed = closedQuery.data ?? [];
  const add = useAddClosedDates();
  const del = useDeleteClosedDates();
  const {
    register, control, handleSubmit, reset,
    formState: { errors, submitCount },
  } = useForm<ClosedForm>({ mode: 'onTouched', resolver: zodResolver(closedSchema), defaultValues: { period: null, label: '' } });
  const [error, setError] = useState<string | null>(null);
  const [showAffected, setShowAffected] = useState(false);

  if (!queriesReady([closedQuery])) return <QueryFallback queries={[closedQuery]} />;

  const fail = (err: unknown) => {
    const code = toSettingsError(err);
    setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
  };

  const submit = handleSubmit(({ period, label }) => {
    if (!period) return;
    setShowAffected(false);
    setError(null);
    add.mutate(
      { from: toYmd(period.from), to: toYmd(period.to), label: label.trim() || null },
      {
        onSuccess: () => {
          reset({ period: null, label: '' });
          setShowAffected(true);
        },
        onError: fail,
      }
    );
  });

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

      <form className="card p-4 space-y-3" noValidate onSubmit={submit}>
        <Controller
          control={control}
          name="period"
          render={({ field }) => (
            <DateRangeField
              id="closed-period"
              label={t('settings.closed.period')}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              error={errors.period?.message}
            />
          )}
        />
        <TextField
          id="closed-label"
          label={t('settings.closed.label')}
          optional
          placeholder={t('settings.closed.placeholder')}
          error={errors.label?.message}
          {...register('label')}
        />
        {submitCount > 0 && <FormSummary count={Object.keys(errors).length} />}
        {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={add.isPending}>{t('settings.closed.add')}</button>
      </form>
    </div>
  );
}
