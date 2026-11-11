import { useState } from 'react';
import { useLang } from '../../context/LanguageContext';
import { isValidPhone } from '../../data/bookings';
import { toSettingsError, useSalonInfo, useSaveSalonInfo } from '../../data/salonSettings';
import type { SalonInfo } from '../../data/types';
import { QueryFallback } from './QueryFallback';

type Field = 'whatsapp' | 'instagram' | 'facebook' | 'form';

const FIELD_OF_CODE: Record<string, Field> = { invalid_phone: 'whatsapp', invalid_url: 'instagram' };

export function SalonInfoSettings() {
  const { t } = useLang();
  const infoQuery = useSalonInfo();
  const save = useSaveSalonInfo();
  const [draft, setDraft] = useState<SalonInfo | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saved, setSaved] = useState(false);

  const info = draft ?? infoQuery.data;
  if (!info) return <QueryFallback queries={[infoQuery]} />;

  const set = (patch: Partial<SalonInfo>) => {
    setSaved(false);
    setErrors({});
    setDraft({ ...info, ...patch });
  };
  const phone = info.whatsapp ?? '';
  const urlBad = (v: string | null) => !!v && v.trim() !== '' && !/^https:\/\//.test(v.trim());

  const submit = () => {
    setSaved(false);
    const next: Partial<Record<Field, string>> = {};
    if (phone.trim() !== '' && !isValidPhone(phone)) next.whatsapp = t('settings.error.invalid_phone');
    if (urlBad(info.instagramUrl)) next.instagram = t('settings.error.invalid_url');
    if (urlBad(info.facebookUrl)) next.facebook = t('settings.error.invalid_url');
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(
      {
        ...info,
        whatsapp: phone.trim(),
        instagramUrl: (info.instagramUrl ?? '').trim(),
        facebookUrl: (info.facebookUrl ?? '').trim(),
      },
      {
        onSuccess: () => {
          setDraft(null);
          setSaved(true);
        },
        onError: (err) => {
          const code = toSettingsError(err);
          const known = ['invalid_phone', 'invalid_url', 'invalid_name', 'not_authorized'].includes(code);
          const msg = t(`settings.error.${known ? code : 'unknown'}`);
          setErrors({ [FIELD_OF_CODE[code] ?? 'form']: msg });
        },
      }
    );
  };

  const err = (f: Field) =>
    errors[f] && <p id={`info-err-${f}`} role="alert" className="text-sm text-rust-600 mt-1">{errors[f]}</p>;
  const aria = (f: Field) => ({ 'aria-invalid': !!errors[f], 'aria-describedby': errors[f] ? `info-err-${f}` : undefined });

  return (
    <form
      noValidate
      className="card p-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <label className="label" htmlFor="info-address-fr">{t('settings.info.addressFr')}</label>
        <textarea id="info-address-fr" className="input" rows={2} maxLength={200} value={info.address.fr}
          onChange={(e) => set({ address: { ...info.address, fr: e.target.value } })} />
      </div>
      <div>
        <label className="label" htmlFor="info-address-ar">{t('settings.info.addressAr')}</label>
        <textarea id="info-address-ar" className="input" rows={2} dir="rtl" maxLength={200} value={info.address.ar}
          onChange={(e) => set({ address: { ...info.address, ar: e.target.value } })} />
      </div>
      <div>
        <label className="label" htmlFor="info-city-fr">{t('settings.info.cityFr')}</label>
        <input id="info-city-fr" className="input" maxLength={200} value={info.city.fr}
          onChange={(e) => set({ city: { ...info.city, fr: e.target.value } })} />
      </div>
      <div>
        <label className="label" htmlFor="info-city-ar">{t('settings.info.cityAr')}</label>
        <input id="info-city-ar" className="input" dir="rtl" maxLength={200} value={info.city.ar}
          onChange={(e) => set({ city: { ...info.city, ar: e.target.value } })} />
      </div>
      <div>
        <label className="label" htmlFor="info-whatsapp">{t('settings.info.whatsapp')}</label>
        <input id="info-whatsapp" type="tel" dir="ltr" className="input" placeholder="0661 22 33 44" value={phone}
          onChange={(e) => set({ whatsapp: e.target.value })} {...aria('whatsapp')} />
        <p className="text-sm text-rose-600 mt-1">{t('settings.info.whatsappHint')}</p>
        {err('whatsapp')}
      </div>
      <div>
        <label className="label" htmlFor="info-instagram">{t('settings.info.instagram')}</label>
        <input id="info-instagram" type="url" dir="ltr" className="input" placeholder="https://" value={info.instagramUrl ?? ''}
          onChange={(e) => set({ instagramUrl: e.target.value })} {...aria('instagram')} />
        {err('instagram')}
      </div>
      <div>
        <label className="label" htmlFor="info-facebook">{t('settings.info.facebook')}</label>
        <input id="info-facebook" type="url" dir="ltr" className="input" placeholder="https://" value={info.facebookUrl ?? ''}
          onChange={(e) => set({ facebookUrl: e.target.value })} {...aria('facebook')} />
        {err('facebook')}
      </div>
      {err('form')}
      {saved && <p role="status" className="text-sm text-sage-700">{t('settings.info.saved')}</p>}
      <button type="submit" className="btn-primary w-full" disabled={save.isPending}>{t('settings.info.save')}</button>
    </form>
  );
}
