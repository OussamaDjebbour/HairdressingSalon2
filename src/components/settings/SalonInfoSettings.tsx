import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLang } from '../../context/LanguageContext';
import { toSettingsError, useSalonInfo, useSaveSalonInfo } from '../../data/salonSettings';
import type { SalonInfo } from '../../data/types';
import { optionalHttpsUrlSchema, optionalMobilePhoneSchema } from '../../data/schemas';
import { TextField } from '../form/TextField';
import { FormSummary } from '../form/FormSummary';
import { applyServerError } from '../form/serverErrors';
import { QueryFallback } from './QueryFallback';

const ERROR_KEYS = ['invalid_name', 'not_authorized'];
const text = z.string().max(200, 'form.error.textLength');

const infoSchema = z.object({
  addressFr: text,
  addressAr: text,
  cityFr: text,
  cityAr: text,
  whatsapp: optionalMobilePhoneSchema,
  instagram: optionalHttpsUrlSchema,
  facebook: optionalHttpsUrlSchema,
});
type InfoForm = z.infer<typeof infoSchema>;

const toValues = (i: SalonInfo): InfoForm => ({
  addressFr: i.address.fr,
  addressAr: i.address.ar,
  cityFr: i.city.fr,
  cityAr: i.city.ar,
  whatsapp: i.whatsapp ?? '',
  instagram: i.instagramUrl ?? '',
  facebook: i.facebookUrl ?? '',
});

function SalonInfoForm({ info }: { info: SalonInfo }) {
  const { t } = useLang();
  const save = useSaveSalonInfo();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    register, handleSubmit, setError, getValues,
    formState: { errors, submitCount },
  } = useForm<InfoForm>({ resolver: zodResolver(infoSchema), defaultValues: toValues(info) });

  const submit = handleSubmit((v) => {
    setSaved(false);
    setFormError(null);
    save.mutate(
      {
        ...info,
        address: { fr: v.addressFr, ar: v.addressAr },
        city: { fr: v.cityFr, ar: v.cityAr },
        whatsapp: v.whatsapp.trim(),
        instagramUrl: v.instagram.trim(),
        facebookUrl: v.facebook.trim(),
      },
      {
        onSuccess: () => setSaved(true),
        onError: (err) => {
          const code = toSettingsError(err);
          // invalid_url: the first link our own check rejects, else Instagram (the server named neither)
          const urlField = optionalHttpsUrlSchema.safeParse(getValues('instagram')).success &&
            !optionalHttpsUrlSchema.safeParse(getValues('facebook')).success
            ? 'facebook'
            : 'instagram';
          const onField = applyServerError(
            code,
            { invalid_phone: 'whatsapp', invalid_url: urlField },
            (name, e) => setError(name as keyof InfoForm, e, { shouldFocus: true }),
            'settings.error'
          );
          if (!onField) setFormError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
        },
      }
    );
  });

  return (
    <form noValidate className="card p-4 space-y-4" onSubmit={submit} onChange={() => setSaved(false)}>
      <TextField id="info-address-fr" label={t('settings.info.addressFr')} multiline error={errors.addressFr?.message} {...register('addressFr')} />
      <TextField id="info-address-ar" label={t('settings.info.addressAr')} multiline optional help={t('form.help.arFallback')} dir="rtl" error={errors.addressAr?.message} {...register('addressAr')} />
      <TextField id="info-city-fr" label={t('settings.info.cityFr')} error={errors.cityFr?.message} {...register('cityFr')} />
      <TextField id="info-city-ar" label={t('settings.info.cityAr')} optional help={t('form.help.arFallback')} dir="rtl" error={errors.cityAr?.message} {...register('cityAr')} />
      <TextField id="info-whatsapp" label={t('settings.info.whatsapp')} type="tel" dir="ltr" placeholder="0661 22 33 44" help={t('settings.info.whatsappHint')} error={errors.whatsapp?.message} {...register('whatsapp')} />
      <TextField id="info-instagram" label={t('settings.info.instagram')} type="url" dir="ltr" placeholder="https://" error={errors.instagram?.message} {...register('instagram')} />
      <TextField id="info-facebook" label={t('settings.info.facebook')} type="url" dir="ltr" placeholder="https://" error={errors.facebook?.message} {...register('facebook')} />
      {submitCount > 0 && <FormSummary count={Object.keys(errors).length} />}
      {formError && <p role="alert" className="text-sm text-rust-600">{formError}</p>}
      {saved && <p role="status" className="text-sm text-sage-700">{t('settings.info.saved')}</p>}
      <button type="submit" className="btn-primary w-full" disabled={save.isPending}>{t('settings.info.save')}</button>
    </form>
  );
}

export function SalonInfoSettings() {
  const infoQuery = useSalonInfo();
  if (!infoQuery.data) return <QueryFallback queries={[infoQuery]} />;
  return <SalonInfoForm info={infoQuery.data} />;
}
