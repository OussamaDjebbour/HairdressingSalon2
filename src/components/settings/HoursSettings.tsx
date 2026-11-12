import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLang } from '../../context/LanguageContext';
import { formatDayName } from '../../data/formatters';
import { toSettingsError, useSalonHours, useSetHours } from '../../data/salonSettings';
import type { SalonHours, Weekday } from '../../data/types';
import { minutesToTime } from '../../data/week';
import { SelectField } from '../form/SelectField';
import type { Option } from '../form/SelectField';
import { SwitchField } from '../form/SwitchField';
import { FormSummary } from '../form/FormSummary';
import { AffectedBookings } from './AffectedBookings';
import { QueryFallback } from './QueryFallback';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const ERROR_KEYS = ['invalid_hours', 'not_authorized'];
const STEP = 15;
const FIRST = 6 * 60;
const LAST = 23 * 60;

/** A date that falls on the given ISO weekday (2024-01-01 is a Monday), for day-name labels. */
const dateOfWeekday = (iso: Weekday) => new Date(2024, 0, iso);

/** Quarter-hour choices; values are "HH:MM", so a stored off-grid time (18:45) is kept by the Select. */
const TIME_OPTIONS: Option[] = [];
for (let m = FIRST; m <= LAST; m += STEP) TIME_OPTIONS.push({ value: minutesToTime(m), label: minutesToTime(m) });

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const daySchema = z
  .object({ on: z.boolean(), opens: z.string(), closes: z.string() })
  .superRefine((d, ctx) => {
    if (d.on && d.opens >= d.closes) ctx.addIssue({ code: 'custom', path: ['closes'], message: 'form.error.hours' });
  });
const hoursSchema = z.object({ days: z.array(daySchema) });
type HoursForm = z.infer<typeof hoursSchema>;

const toValues = (hours: SalonHours): HoursForm => ({
  days: WEEKDAYS.map((d) => {
    const h = hours[d];
    return { on: !!h, opens: minutesToTime(h?.opens ?? 9 * 60), closes: minutesToTime(h?.closes ?? 18 * 60) };
  }),
});

function HoursFormCard({ hours }: { hours: SalonHours }) {
  const { t, lang } = useLang();
  const save = useSetHours();
  const [error, setError] = useState<string | null>(null);
  const [showAffected, setShowAffected] = useState(false);
  const {
    control, handleSubmit,
    formState: { errors, submitCount },
  } = useForm<HoursForm>({ mode: 'onTouched', resolver: zodResolver(hoursSchema), defaultValues: toValues(hours) });

  const submit = handleSubmit((v) => {
    setError(null);
    setShowAffected(false);
    const payload = {} as SalonHours;
    WEEKDAYS.forEach((d, i) => {
      const day = v.days[i];
      payload[d] = day.on ? { opens: toMinutes(day.opens), closes: toMinutes(day.closes) } : null;
    });
    save.mutate(payload, {
      onSuccess: () => setShowAffected(true),
      onError: (err) => {
        const code = toSettingsError(err);
        setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
      },
    });
  });

  const rowErrors = errors.days ?? [];
  const errorCount = Array.isArray(rowErrors) ? rowErrors.filter(Boolean).length : 0;

  return (
    <div>
      {showAffected && <AffectedBookings />}
      <form className="card p-4 space-y-3" noValidate onSubmit={submit}>
        {WEEKDAYS.map((d, i) => {
          const name = formatDayName(dateOfWeekday(d), lang);
          const rowError = errors.days?.[i]?.closes?.message;
          return (
            <Controller
              key={d}
              control={control}
              name={`days.${i}`}
              render={({ field }) => {
                const day = field.value;
                return (
                  <div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-h-11">
                      <div className="w-36">
                        <SwitchField
                          id={`hours-on-${d}`}
                          label={name}
                          checked={day.on}
                          onCheckedChange={(on) => field.onChange({ ...day, on })}
                        />
                      </div>
                      {day.on ? (
                        <div className="flex flex-wrap items-start gap-2 [&_label]:sr-only">
                          <div className="w-28">
                            <SelectField
                              id={`hours-opens-${d}`}
                              label={`${name} · ${t('settings.hours.opens')}`}
                              value={day.opens}
                              options={TIME_OPTIONS}
                              dirLtrValues
                              onValueChange={(opens) => field.onChange({ ...day, opens })}
                            />
                          </div>
                          <span aria-hidden className="text-rose-600">–</span>
                          <div className={rowError ? 'w-full' : 'w-28'}>
                            <SelectField
                              id={`hours-closes-${d}`}
                              label={`${name} · ${t('settings.hours.closes')}`}
                              value={day.closes}
                              options={TIME_OPTIONS}
                              dirLtrValues
                              onValueChange={(closes) => field.onChange({ ...day, closes })}
                              onBlur={field.onBlur}
                              ref={field.ref}
                              error={rowError}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-rose-600">{t('settings.hours.closed')}</span>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          );
        })}
        {submitCount > 0 && <FormSummary count={errorCount} />}
        {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={save.isPending}>{t('settings.hours.save')}</button>
      </form>
    </div>
  );
}

export function HoursSettings() {
  const hoursQuery = useSalonHours();
  if (!hoursQuery.data) return <QueryFallback queries={[hoursQuery]} />;
  return <HoursFormCard hours={hoursQuery.data} />;
}
