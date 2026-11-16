import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { formatDuration } from '../../data/formatters';
import { useAllServices, useAllStylists } from '../../data/queries';
import {
  toSettingsError,
  ServiceSaveError,
  useSaveServiceWithPhoto,
  useSetServiceActive,
  type PhotoChange,
  type SaveServiceInput,
} from '../../data/salonSettings';
import type { Service } from '../../data/types';
import { checkPromo, clientNameSchema } from '../../data/schemas';
import { AffectedBookings } from './AffectedBookings';
import { TextField } from '../form/TextField';
import { SelectField } from '../form/SelectField';
import { CheckboxField } from '../form/CheckboxField';
import { FormSummary } from '../form/FormSummary';
import { applyServerError } from '../form/serverErrors';
import { QueryFallback, queriesReady } from './QueryFallback';
import { CatalogRow, PromoFields, emptyPromo, promoToInput, promoToValues, type PromoValues } from './catalogShared';
import { ServicePhotoField } from './ServicePhotoField';
import { useToast } from '../admin/feedback';
import { useMyRole } from '../../data/admin';

const DURATIONS = Array.from({ length: 40 }, (_, i) => (i + 1) * 15); // 15 … 600
const ERROR_KEYS = ['invalid_name', 'invalid_price', 'invalid_duration', 'invalid_pack', 'invalid_promo', 'not_found', 'not_authorized', 'demo_disabled', 'invalid_photo', 'upload_failed'];
const SERVER_ERROR_FIELDS = {
  invalid_name: 'nameFr', invalid_price: 'price', invalid_duration: 'duration',
  invalid_pack: 'stylistId', invalid_promo: 'promoPrice',
};

const packSchema = z.object({
  nameFr: clientNameSchema,
  nameAr: z.string(),
  descFr: z.string(),
  descAr: z.string(),
  price: z.string().superRefine((v, ctx) => {
    if (!/^\d+$/.test(v.trim()) || parseInt(v.trim(), 10) > 1_000_000) ctx.addIssue({ code: 'custom', message: 'form.error.price' });
  }),
  duration: z.string(),
  stylistId: z.string().min(1, 'settings.error.invalid_pack'),
  includes: z.array(z.string()),
  promoPrice: z.string(),
  promoPeriod: z.custom<PromoValues['promoPeriod']>(),
}).superRefine(checkPromo);
type PackForm = z.infer<typeof packSchema>;

const emptyValues: PackForm = {
  nameFr: '', nameAr: '', descFr: '', descAr: '', price: '', duration: '60', stylistId: '', includes: [], ...emptyPromo,
};

function toValues(s: Service): PackForm {
  return {
    nameFr: s.name.fr, nameAr: s.name.ar, descFr: s.description.fr, descAr: s.description.ar,
    price: String(s.price), duration: String(s.duration),
    stylistId: s.packStylistId ?? '', includes: [...s.includes],
    ...promoToValues(s),
  };
}

function toInput(id: string | null, sortOrder: number | null, d: PackForm): SaveServiceInput {
  const desc = { fr: d.descFr.trim(), ar: d.descAr.trim() };
  return {
    id,
    name: { fr: d.nameFr.trim(), ar: d.nameAr.trim() },
    description: desc.fr || desc.ar ? desc : null,
    category: 'pack',
    price: parseInt(d.price.trim(), 10),
    duration: parseInt(d.duration, 10),
    sortOrder,
    includes: d.includes,
    packStylistId: d.stylistId,
    promo: promoToInput(d),
  };
}

interface Draft { id: string | null; sortOrder: number | null; values: PackForm; image: string }

function PackFormCard({ draft, services, onSaved, onCancel }: { draft: Draft; services: Service[]; onSaved(): void; onCancel(): void }) {
  const { t, lang } = useLang();
  const stylists = useAllStylists().data ?? [];
  const save = useSaveServiceWithPhoto();
  const queryClient = useQueryClient();
  const demo = useMyRole() === 'demo';
  const [formError, setFormError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PhotoChange>({ kind: 'keep' });
  const [preparing, setPreparing] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const {
    register, control, handleSubmit, setError, setValue, watch,
    formState: { errors, submitCount },
  } = useForm<PackForm>({ mode: 'onTouched', resolver: zodResolver(packSchema), defaultValues: draft.values });

  const stylistId = watch('stylistId');
  const person = stylists.find((s) => s.id === stylistId);
  const options = stylists
    .filter((s) => s.active || s.id === stylistId)
    .map((s) => ({ value: s.id, label: s.active ? s.name : `${s.name} (${t('settings.services.hidden')})` }));

  const submit = handleSubmit((values) => {
    setFormError(null);
    save.mutate({ input: toInput(savedId ?? draft.id, draft.sortOrder, values), photo }, {
      onSuccess: onSaved,
      onError: (err) => {
        if (err instanceof ServiceSaveError) {
          if (err.serviceId) setSavedId(err.serviceId);
          void queryClient.invalidateQueries({ queryKey: ['services'] });
        }
        const code = toSettingsError(err);
        const onField = applyServerError(code, SERVER_ERROR_FIELDS, (name, e) => setError(name as keyof PackForm, e, { shouldFocus: true }), 'settings.error');
        if (!onField) setFormError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
      },
    });
  });

  return (
    <form className="card p-4 sm:p-5 space-y-4" noValidate onSubmit={submit}>
      <h2 className="font-display text-lg font-semibold text-rose-800">
        {t(draft.id ? 'settings.services.edit' : 'settings.pack.new')}
      </h2>
      <ServicePhotoField
        id="pack-photo" currentUrl={draft.image} category="pack" value={photo}
        onChange={setPhoto} onBusyChange={setPreparing} demo={demo} disabled={save.isPending}
      />
      <TextField id="pack-name-fr" label={t('settings.services.nameFr')} error={errors.nameFr?.message} {...register('nameFr')} />
      <TextField id="pack-name-ar" label={t('settings.services.nameAr')} optional help={t('form.help.arFallback')} dir="rtl" {...register('nameAr')} />
      <TextField id="pack-desc-fr" label={t('settings.services.descFr')} optional multiline {...register('descFr')} />
      <TextField id="pack-desc-ar" label={t('settings.services.descAr')} optional help={t('form.help.arFallback')} multiline dir="rtl" {...register('descAr')} />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="pack-price" label={t('settings.services.price')} inputMode="numeric" error={errors.price?.message} {...register('price')} />
        <Controller
          control={control}
          name="duration"
          render={({ field }) => (
            <SelectField
              id="pack-duration" label={t('settings.services.duration')} value={field.value}
              onValueChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
              error={errors.duration?.message}
              options={DURATIONS.map((m) => ({ value: String(m), label: formatDuration(m, lang) }))}
              formatValue={(v) => formatDuration(Number(v), lang)}
            />
          )}
        />
      </div>
      <Controller
        control={control}
        name="stylistId"
        render={({ field }) => (
          <SelectField
            id="pack-stylist" label={t('settings.pack.stylist')} value={field.value}
            onValueChange={field.onChange} onBlur={field.onBlur} ref={field.ref}
            error={errors.stylistId?.message}
            options={options}
          />
        )}
      />
      {person && !person.active && <p role="status" className="text-sm text-amber-800">{t('settings.pack.unbookable')}</p>}
      <Controller
        control={control}
        name="includes"
        render={({ field }) => {
          const chosen = new Set(field.value);
          return (
            <fieldset>
              <legend className="label">{t('settings.pack.includes')}</legend>
              <ul className="space-y-1">
                {services.map((s) => (
                  <li key={s.id}>
                    <CheckboxField
                      id={`pack-inc-${s.id}`}
                      checked={chosen.has(s.id)}
                      onCheckedChange={(on) => field.onChange(on ? [...field.value, s.id] : field.value.filter((x) => x !== s.id))}
                      label={`${s.name[lang]}${s.active ? '' : ` (${t('settings.services.hidden')})`}`}
                    />
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        }}
      />
      <PromoFields idPrefix="pack" register={register} control={control} errors={errors} setValue={setValue} />
      {submitCount > 0 && <FormSummary count={Object.keys(errors).length} />}
      {formError && <p role="alert" className="text-sm text-rust-600">{formError}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn-primary flex-1" disabled={save.isPending || preparing}>{t('settings.services.save')}</button>
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>{t('settings.services.cancel')}</button>
      </div>
    </form>
  );
}

export function PacksSettings() {
  const { t } = useLang();
  const servicesQuery = useAllServices();
  const stylistsQuery = useAllStylists();
  const all = servicesQuery.data ?? [];
  const packs = all.filter((s) => s.category === 'pack');
  const plain = all.filter((s) => s.category !== 'pack');
  const setActive = useSetServiceActive();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAffected, setShowAffected] = useState(false);

  if (!queriesReady([servicesQuery, stylistsQuery])) return <QueryFallback queries={[servicesQuery, stylistsQuery]} />;

  const ordered = [...packs.filter((s) => s.active), ...packs.filter((s) => !s.active)];

  const toggle = (s: Service) => {
    setError(null);
    setActive.mutate({ id: s.id, active: !s.active }, {
      onSuccess: () => {
        setShowAffected(true);
        toast(t(s.active ? 'settings.toast.serviceHidden' : 'settings.toast.serviceShown'));
      },
      onError: (err) => {
        const code = toSettingsError(err);
        setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
      },
    });
  };

  if (draft) {
    return (
      <PackFormCard
        draft={draft}
        services={plain}
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
      <button type="button" className="btn-primary w-full mb-4" onClick={() => { setError(null); setDraft({ id: null, sortOrder: null, values: emptyValues, image: '' }); }}>
        <Plus className="w-4 h-4" strokeWidth={2} aria-hidden /> {t('settings.pack.new')}
      </button>
      <ul className="space-y-2">
        {ordered.map((s) => (
          <CatalogRow
            key={s.id} s={s} toggling={setActive.isPending} onToggle={() => toggle(s)}
            onOpen={() => { setError(null); setDraft({ id: s.id, sortOrder: s.sortOrder, values: toValues(s), image: s.image }); }}
          />
        ))}
      </ul>
    </div>
  );
}
