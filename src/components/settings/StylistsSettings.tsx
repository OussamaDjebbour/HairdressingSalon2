import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { toYmd } from '../../data/bookings';
import { formatDayName, formatLongDate } from '../../data/formatters';
import { useAllServices, useAllStylists } from '../../data/queries';
import {
  toSettingsError,
  useAddStylistDaysOff,
  useDeleteStylistDaysOff,
  useSaveStylist,
  useSetStylistActive,
  useStylistDaysOff,
} from '../../data/salonSettings';
import type { Service, Stylist, Weekday } from '../../data/types';
import { salonDate } from '../../data/week';
import { clientNameSchema, periodSchema } from '../../data/schemas';
import type { Period } from '../../data/period';
import { TextField } from '../form/TextField';
import { CheckboxField } from '../form/CheckboxField';
import { DateRangeField } from '../form/DateRangeField';
import { FormSummary } from '../form/FormSummary';
import { applyServerError } from '../form/serverErrors';
import { AffectedBookings } from './AffectedBookings';
import { QueryFallback, queriesReady } from './QueryFallback';

const ERROR_KEYS = ['invalid_name', 'invalid_weekday', 'invalid_dates', 'unknown_service', 'not_found', 'not_authorized'];
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** A date that falls on the given ISO weekday (2024-01-01 is a Monday), for day-name labels. */
const dateOfWeekday = (iso: Weekday) => new Date(2024, 0, iso);
const parseYmd = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const SERVER_ERROR_FIELDS = { invalid_name: 'name' };
const DAY_OFF_ERROR_FIELDS = { invalid_dates: 'period' };

const stylistSchema = z.object({
  name: clientNameSchema,
  roleFr: z.string(),
  roleAr: z.string(),
  serviceIds: z.array(z.string()),
  workdays: z.array(z.number()),
});
type StylistForm = z.infer<typeof stylistSchema>;

const dayOffSchema = z.object({ period: periodSchema });
type DayOffForm = { period: Period | null };

const emptyValues: StylistForm = { name: '', roleFr: '', roleAr: '', serviceIds: [], workdays: [] };

const toValues = (s: Stylist): StylistForm => ({
  name: s.name,
  roleFr: s.role.fr,
  roleAr: s.role.ar,
  serviceIds: [...s.serviceIds],
  workdays: [...s.workdays],
});

interface Draft {
  id: string | null;
  values: StylistForm;
}

const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

interface FormProps {
  draft: Draft;
  services: Service[];
  error: string | null;
  onFail(err: unknown): void;
  onStart(): void;
  onSaved(): void;
  onCancel(): void;
}

function StylistFormCard({ draft, services, error, onFail, onStart, onSaved, onCancel }: FormProps) {
  const { t, lang } = useLang();
  const save = useSaveStylist();
  const {
    register, control, handleSubmit, setError,
    formState: { errors, submitCount },
  } = useForm<StylistForm>({ mode: 'onTouched', resolver: zodResolver(stylistSchema), defaultValues: draft.values });

  const submit = handleSubmit((v) => {
    onStart();
    save.mutate(
      {
        id: draft.id,
        name: v.name.trim(),
        role: { fr: v.roleFr.trim(), ar: v.roleAr.trim() },
        serviceIds: v.serviceIds,
        workdays: v.workdays as Weekday[],
      },
      {
        onSuccess: onSaved,
        onError: (err) => {
          const onField = applyServerError(toSettingsError(err), SERVER_ERROR_FIELDS, (name, e) => setError(name as keyof StylistForm, e, { shouldFocus: true }), 'settings.error');
          if (!onField) onFail(err);
        },
      }
    );
  });

  return (
    <form className="card p-4 sm:p-5 space-y-4" noValidate onSubmit={submit}>
      <h2 className="font-display text-lg font-semibold text-rose-800">
        {t(draft.id ? 'settings.stylists.edit' : 'settings.stylists.new')}
      </h2>
      <TextField id="sty-name" label={t('settings.stylists.name')} error={errors.name?.message} {...register('name')} />
      <TextField id="sty-role-fr" label={t('settings.stylists.roleFr')} {...register('roleFr')} />
      <TextField id="sty-role-ar" label={t('settings.stylists.roleAr')} optional help={t('form.help.arFallback')} dir="rtl" {...register('roleAr')} />

      <Controller
        control={control}
        name="serviceIds"
        render={({ field }) => {
          const linked = new Set(field.value);
          const offered = services.filter((s) => s.active || linked.has(s.id));
          return (
            <fieldset>
              <legend className="label">{t('settings.stylists.services')}</legend>
              <ul className="space-y-1">
                {offered.map((s) => (
                  <li key={s.id}>
                    <CheckboxField
                      id={`sty-svc-${s.id}`}
                      checked={linked.has(s.id)}
                      onCheckedChange={() => field.onChange(toggleIn(field.value, s.id))}
                      label={`${s.name[lang]}${s.active ? '' : ` (${t('settings.services.hidden')})`}`}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        }}
      />

      <Controller
        control={control}
        name="workdays"
        render={({ field }) => (
          <fieldset>
            <legend className="label">{t('settings.stylists.workdays')}</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = field.value.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    className={`${on ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => field.onChange(toggleIn(field.value, d).sort())}
                  >
                    {formatDayName(dateOfWeekday(d), lang)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
      />

      {submitCount > 0 && <FormSummary count={Object.keys(errors).length} />}
      {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn-primary flex-1" disabled={save.isPending}>{t('settings.services.save')}</button>
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>{t('settings.services.cancel')}</button>
      </div>
    </form>
  );
}

function AddDayOff({ stylistId, onStart, onAdded, onFail }: { stylistId: string; onStart(): void; onAdded(): void; onFail(err: unknown): void }) {
  const { t } = useLang();
  const addOff = useAddStylistDaysOff();
  const {
    control, handleSubmit, reset, setError,
    formState: { errors },
  } = useForm<DayOffForm>({ mode: 'onTouched', resolver: zodResolver(dayOffSchema), defaultValues: { period: null } });

  const add = handleSubmit(({ period }) => {
    if (!period) return;
    onStart();
    addOff.mutate(
      { stylistId, from: toYmd(period.from), to: toYmd(period.to) },
      {
        onSuccess: () => {
          reset({ period: null });
          onAdded();
        },
        onError: (err) => {
          const onField = applyServerError(toSettingsError(err), DAY_OFF_ERROR_FIELDS, (name, e) => setError(name as keyof DayOffForm, e), 'settings.error');
          if (!onField) onFail(err);
        },
      }
    );
  });

  return (
    <>
      <Controller
        control={control}
        name="period"
        render={({ field }) => (
          <DateRangeField
            id="off-period"
            label={t('settings.stylists.offPeriod')}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            error={errors.period?.message}
          />
        )}
      />
      <button type="button" className="btn-secondary w-full" disabled={addOff.isPending} onClick={add}>
        {t('settings.stylists.addDayOff')}
      </button>
    </>
  );
}

export function StylistsSettings() {
  const { t, lang } = useLang();
  const stylistsQuery = useAllStylists();
  const servicesQuery = useAllServices();
  const daysOffQuery = useStylistDaysOff();
  const stylists = stylistsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const daysOff = daysOffQuery.data ?? [];
  const setActive = useSetStylistActive();
  const delOff = useDeleteStylistDaysOff();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAffected, setShowAffected] = useState(false);

  const queries = [stylistsQuery, servicesQuery, daysOffQuery];
  if (!queriesReady(queries)) return <QueryFallback queries={queries} />;

  const fail = (err: unknown) => {
    const code = toSettingsError(err);
    setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
  };

  const ordered = [...stylists.filter((s) => s.active), ...stylists.filter((s) => !s.active)];
  const today = toYmd(salonDate(new Date()));

  const open = (d: Draft) => {
    setError(null);
    setDraft(d);
  };

  const toggleActive = (s: Stylist) => {
    setError(null);
    setActive.mutate({ id: s.id, active: !s.active }, { onSuccess: () => setShowAffected(true), onError: fail });
  };

  if (draft) {
    const upcoming = daysOff.filter((d) => d.stylistId === draft.id && d.to >= today);
    return (
      <div className="space-y-5">
        {showAffected && <AffectedBookings />}
        <StylistFormCard
          key={draft.id ?? 'new'}
          draft={draft}
          services={services}
          error={error}
          onFail={fail}
          onStart={() => setError(null)}
          onSaved={() => {
            setDraft(null);
            setShowAffected(true);
          }}
          onCancel={() => { setDraft(null); setError(null); }}
        />

        {draft.id && (
          <section className="card p-4 sm:p-5 space-y-3">
            <h3 className="font-display text-base font-semibold text-rose-800">{t('settings.stylists.daysOff')}</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-rose-600">{t('settings.stylists.noDaysOff')}</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-rose-800">
                    <span data-testid="day-off">
                      {d.from === d.to
                        ? formatLongDate(parseYmd(d.from), lang)
                        : `${formatLongDate(parseYmd(d.from), lang)} → ${formatLongDate(parseYmd(d.to), lang)}`}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost btn-sm shrink-0"
                      aria-label={t('settings.stylists.deleteDayOff')}
                      disabled={delOff.isPending}
                      onClick={() => delOff.mutate({ id: d.id }, { onError: fail })}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.8} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AddDayOff stylistId={draft.id} onStart={() => setError(null)} onAdded={() => { setError(null); setShowAffected(true); }} onFail={fail} />
          </section>
        )}
      </div>
    );
  }

  return (
    <div>
      {showAffected && <AffectedBookings />}
      {error && <p role="alert" className="text-sm text-rust-600 mb-3">{error}</p>}
      <button type="button" className="btn-primary w-full mb-4" onClick={() => open({ id: null, values: emptyValues })}>
        <Plus className="w-4 h-4" strokeWidth={2} aria-hidden /> {t('settings.services.add')}
      </button>
      <ul className="space-y-2">
        {ordered.map((s) => (
          <li key={s.id} className={`card relative flex items-center gap-2 ps-4 pe-3 py-2 ${s.active ? '' : 'opacity-70'}`}>
            <button type="button" className="flex-1 min-w-0 text-start py-1 after:absolute after:inset-0 after:rounded-[inherit] after:content-['']" onClick={() => open({ id: s.id, values: toValues(s) })}>
              <span className="flex-1 min-w-0">
                <span data-testid="stylist-name" className="block font-medium text-rose-800 break-words">{s.name}</span>
                <span className="block text-sm text-rose-600">
                  {s.role[lang]}
                  {!s.active && <span className="ms-2 text-xs font-semibold text-amber-800">{t('settings.stylists.hidden')}</span>}
                </span>
              </span>
            </button>
            <button type="button" className="btn-ghost btn-sm tap relative z-10 shrink-0" disabled={setActive.isPending} onClick={() => toggleActive(s)}>
              {t(s.active ? 'settings.services.hide' : 'settings.services.show')}
            </button>
            <ChevronRight className="w-4 h-4 shrink-0 text-gold-600 rtl:rotate-180" strokeWidth={1.8} aria-hidden="true" />
          </li>
        ))}
      </ul>
    </div>
  );
}
