import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, Plus } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { formatDuration, formatPrice } from '../../data/formatters';
import { useAllServices } from '../../data/queries';
import {
  toSettingsError,
  ServiceSaveError,
  useSaveServiceWithPhoto,
  useSetServiceActive,
  type PhotoChange,
  type SaveServiceInput,
} from '../../data/salonSettings';
import type { Service } from '../../data/types';
import { clientNameSchema } from '../../data/schemas';
import { AffectedBookings } from './AffectedBookings';
import { TextField } from '../form/TextField';
import { SelectField } from '../form/SelectField';
import { FormSummary } from '../form/FormSummary';
import { applyServerError } from '../form/serverErrors';
import { QueryFallback, queriesReady } from './QueryFallback';
import { useToast } from '../admin/feedback';
import { useMyRole } from '../../data/admin';
import { ServicePhotoField } from './ServicePhotoField';
import { SERVICE_FORM_CATEGORIES, isServiceFormCategory } from '../../data/categories';

const DURATIONS = Array.from({ length: 40 }, (_, i) => (i + 1) * 15); // 15 … 600
const ERROR_KEYS = ['invalid_name', 'invalid_price', 'invalid_duration', 'not_found', 'not_authorized', 'demo_disabled', 'invalid_photo', 'upload_failed'];

const SERVER_ERROR_FIELDS = { invalid_name: 'nameFr', invalid_price: 'price', invalid_duration: 'duration' };

const serviceSchema = z.object({
  nameFr: clientNameSchema,
  nameAr: z.string(),
  descFr: z.string(),
  descAr: z.string(),
  category: z.enum(SERVICE_FORM_CATEGORIES),
  price: z.string().superRefine((v, ctx) => {
    const n = v.trim();
    if (!/^\d+$/.test(n) || parseInt(n, 10) > 1_000_000) ctx.addIssue({ code: 'custom', message: 'form.error.price' });
  }),
  duration: z.string(),
  sortOrder: z.string().superRefine((v, ctx) => {
    if (v.trim() !== '' && !/^\d+$/.test(v.trim())) ctx.addIssue({ code: 'custom', message: 'form.error.sortOrder' });
  }),
});
type ServiceForm = z.infer<typeof serviceSchema>;

const emptyValues: ServiceForm = {
  nameFr: '', nameAr: '', descFr: '', descAr: '', category: 'coiffure', price: '', duration: '30', sortOrder: '',
};

function toValues(s: Service): ServiceForm {
  return {
    nameFr: s.name.fr,
    nameAr: s.name.ar,
    descFr: s.description.fr,
    descAr: s.description.ar,
    category: isServiceFormCategory(s.category) ? s.category : 'coiffure',
    price: String(s.price),
    duration: String(s.duration),
    sortOrder: String(s.sortOrder),
  };
}

function toInput(id: string | null, d: ServiceForm): SaveServiceInput {
  const desc = { fr: d.descFr.trim(), ar: d.descAr.trim() };
  return {
    id,
    name: { fr: d.nameFr.trim(), ar: d.nameAr.trim() },
    description: desc.fr || desc.ar ? desc : null,
    category: d.category,
    price: parseInt(d.price.trim(), 10),
    duration: parseInt(d.duration, 10),
    sortOrder: d.sortOrder.trim() === '' ? null : parseInt(d.sortOrder.trim(), 10),
    includes: [],
    packStylistId: null,
    promo: null,
  };
}

interface Draft {
  id: string | null;
  values: ServiceForm;
  image: string;
}

function ServiceFormCard({ draft, onSaved, onCancel }: { draft: Draft; onSaved(): void; onCancel(): void }) {
  const { t, lang } = useLang();
  const save = useSaveServiceWithPhoto();
  const queryClient = useQueryClient();
  const demo = useMyRole() === 'demo';
  const [formError, setFormError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [preparing, setPreparing] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const {
    register, control, handleSubmit, setError, watch,
    formState: { errors, submitCount },
  } = useForm<ServiceForm>({ mode: 'onTouched', resolver: zodResolver(serviceSchema), defaultValues: draft.values });

  const submit = handleSubmit((values) => {
    setFormError(null);
    save.mutate({ input: toInput(savedId ?? draft.id, values), photo }, {
      onSuccess: onSaved,
      onError: (err) => {
        if (err instanceof ServiceSaveError) {
          if (err.serviceId) setSavedId(err.serviceId);
          // The service itself may have been saved even though the photo step failed.
          void queryClient.invalidateQueries({ queryKey: ['services'] });
        }
        const code = toSettingsError(err);
        const onField = applyServerError(code, SERVER_ERROR_FIELDS, (name, e) => setError(name as keyof ServiceForm, e, { shouldFocus: true }), 'settings.error');
        if (!onField) setFormError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
      },
    });
  });

  return (
    <form className="card p-4 sm:p-5 space-y-4" noValidate onSubmit={submit}>
      <h2 className="font-display text-lg font-semibold text-rose-800">
        {t(draft.id ? 'settings.services.edit' : 'settings.services.new')}
      </h2>
      <ServicePhotoField
        id="svc-photo"
        currentUrl={draft.image}
        category={watch('category')}
        value={photo}
        onChange={setPhoto}
        onBusyChange={setPreparing}
        demo={demo}
        disabled={save.isPending}
      />
      <TextField id="svc-name-fr" label={t('settings.services.nameFr')} error={errors.nameFr?.message} {...register('nameFr')} />
      <TextField id="svc-name-ar" label={t('settings.services.nameAr')} optional help={t('form.help.arFallback')} dir="rtl" {...register('nameAr')} />
      <TextField id="svc-desc-fr" label={t('settings.services.descFr')} optional multiline {...register('descFr')} />
      <TextField id="svc-desc-ar" label={t('settings.services.descAr')} optional help={t('form.help.arFallback')} multiline dir="rtl" {...register('descAr')} />
      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <SelectField
            id="svc-category"
            label={t('settings.services.category')}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            options={SERVICE_FORM_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))}
          />
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="svc-price" label={t('settings.services.price')} inputMode="numeric" error={errors.price?.message} {...register('price')} />
        <Controller
          control={control}
          name="duration"
          render={({ field }) => (
            <SelectField
              id="svc-duration"
              label={t('settings.services.duration')}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              error={errors.duration?.message}
              options={DURATIONS.map((m) => ({ value: String(m), label: formatDuration(m, lang) }))}
              formatValue={(v) => formatDuration(Number(v), lang)}
            />
          )}
        />
      </div>
      <TextField
        id="svc-order"
        label={t('settings.services.order')}
        help={t('settings.services.sortHelp')}
        inputMode="numeric"
        error={errors.sortOrder?.message}
        {...register('sortOrder')}
      />
      {submitCount > 0 && <FormSummary count={Object.keys(errors).length} />}
      {formError && <p role="alert" className="text-sm text-rust-600">{formError}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn-primary flex-1" disabled={save.isPending || preparing}>{t('settings.services.save')}</button>
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>{t('settings.services.cancel')}</button>
      </div>
    </form>
  );
}

export function ServicesSettings() {
  const { t, lang } = useLang();
  const servicesQuery = useAllServices();
  const services = servicesQuery.data ?? [];
  const setActive = useSetServiceActive();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAffected, setShowAffected] = useState(false);

  if (!queriesReady([servicesQuery])) return <QueryFallback queries={[servicesQuery]} />;

  const fail = (err: unknown) => {
    const code = toSettingsError(err);
    setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
  };

  const ordered = [...services.filter((s) => s.active), ...services.filter((s) => !s.active)];

  const toggle = (s: Service) => {
    setError(null);
    setActive.mutate(
      { id: s.id, active: !s.active },
      {
        onSuccess: () => {
          setShowAffected(true);
          toast(t(s.active ? 'settings.toast.serviceHidden' : 'settings.toast.serviceShown'));
        },
        onError: fail,
      }
    );
  };

  if (draft) {
    return (
      <ServiceFormCard
        draft={draft}
        onSaved={() => {
          toast(t(draft.id ? 'settings.toast.serviceSaved' : 'settings.toast.serviceAdded'));
          setDraft(null);
          setShowAffected(true);
        }}
        onCancel={() => { setDraft(null); setError(null); }}
      />
    );
  }

  return (
    <div>
      {showAffected && <AffectedBookings />}
      {error && <p role="alert" className="text-sm text-rust-600 mb-3">{error}</p>}
      <button type="button" className="btn-primary w-full mb-4" onClick={() => { setError(null); setDraft({ id: null, values: emptyValues, image: '' }); }}>
        <Plus className="w-4 h-4" strokeWidth={2} aria-hidden /> {t('settings.services.add')}
      </button>
      <ul className="space-y-2">
        {ordered.map((s) => (
          <li key={s.id} className={`card relative flex items-center gap-2 ps-4 pe-3 py-2 ${s.active ? '' : 'opacity-70'}`}>
            <button
              type="button"
              className="flex-1 min-w-0 text-start py-1 after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
              onClick={() => { setError(null); setDraft({ id: s.id, values: toValues(s), image: s.image }); }}
            >
              <span className="flex-1 min-w-0">
                <span data-testid="service-name" className="block font-medium text-rose-800 break-words">{s.name[lang]}</span>
                <span className="block text-sm text-rose-600">
                  {formatPrice(s.price, lang)} · {formatDuration(s.duration, lang)}
                  {!s.active && <span className="ms-2 text-xs font-semibold text-amber-800">{t('settings.services.hidden')}</span>}
                </span>
              </span>
            </button>
            <button type="button" className="btn-ghost btn-sm tap relative z-10 shrink-0" disabled={setActive.isPending} onClick={() => toggle(s)}>
              {t(s.active ? 'settings.services.hide' : 'settings.services.show')}
            </button>
            <ChevronRight className="w-4 h-4 shrink-0 text-gold-600 rtl:rotate-180" strokeWidth={1.8} aria-hidden="true" />
          </li>
        ))}
      </ul>
    </div>
  );
}
