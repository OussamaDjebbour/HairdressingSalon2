import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { formatDuration, formatPrice } from '../../data/formatters';
import { useAllServices } from '../../data/queries';
import {
  toSettingsError,
  useSaveService,
  useSetServiceActive,
  type SaveServiceInput,
} from '../../data/salonSettings';
import type { Service } from '../../data/types';
import { AffectedBookings } from './AffectedBookings';
import { QueryFallback, queriesReady } from './QueryFallback';

const DURATIONS = Array.from({ length: 40 }, (_, i) => (i + 1) * 15); // 15 … 600
const ERROR_KEYS = ['invalid_name', 'invalid_price', 'invalid_duration', 'not_found', 'not_authorized'];

interface Draft {
  id: string | null;
  nameFr: string;
  nameAr: string;
  descFr: string;
  descAr: string;
  category: 'coiffure' | 'beaute';
  price: string;
  duration: number;
  sortOrder: string;
}

const emptyDraft: Draft = {
  id: null, nameFr: '', nameAr: '', descFr: '', descAr: '', category: 'coiffure', price: '', duration: 30, sortOrder: '',
};

function toDraft(s: Service): Draft {
  return {
    id: s.id,
    nameFr: s.name.fr,
    nameAr: s.name.ar,
    descFr: s.description.fr,
    descAr: s.description.ar,
    category: s.category === 'beaute' ? 'beaute' : 'coiffure',
    price: String(s.price),
    duration: s.duration,
    sortOrder: String(s.sortOrder),
  };
}

function toInput(d: Draft): SaveServiceInput | null {
  if (!/^\d+$/.test(d.price.trim())) return null;
  const desc = { fr: d.descFr.trim(), ar: d.descAr.trim() };
  return {
    id: d.id,
    name: { fr: d.nameFr.trim(), ar: d.nameAr.trim() },
    description: desc.fr || desc.ar ? desc : null,
    category: d.category,
    price: parseInt(d.price, 10),
    duration: d.duration,
    sortOrder: /^\d+$/.test(d.sortOrder.trim()) ? parseInt(d.sortOrder, 10) : null,
  };
}

export function ServicesSettings() {
  const { t, lang } = useLang();
  const servicesQuery = useAllServices();
  const services = servicesQuery.data ?? [];
  const save = useSaveService();
  const setActive = useSetServiceActive();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAffected, setShowAffected] = useState(false);

  if (!queriesReady([servicesQuery])) return <QueryFallback queries={[servicesQuery]} />;

  const fail = (err: unknown) => {
    const code = toSettingsError(err);
    setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
  };

  const ordered = [...services.filter((s) => s.active), ...services.filter((s) => !s.active)];

  const submit = () => {
    if (!draft) return;
    const input = toInput(draft);
    if (!input) return setError(t('settings.error.invalid_price'));
    setError(null);
    save.mutate(input, {
      onSuccess: () => {
        setDraft(null);
        setShowAffected(true);
      },
      onError: fail,
    });
  };

  const toggle = (s: Service) => {
    setError(null);
    setActive.mutate(
      { id: s.id, active: !s.active },
      { onSuccess: () => setShowAffected(true), onError: fail }
    );
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  if (draft) {
    return (
      <form
        className="card p-4 sm:p-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="font-display text-lg font-semibold text-rose-800">
          {t(draft.id ? 'settings.services.edit' : 'settings.services.new')}
        </h2>
        <Field id="svc-name-fr" label={t('settings.services.nameFr')}>
          <input id="svc-name-fr" className="input" value={draft.nameFr} onChange={(e) => set('nameFr', e.target.value)} />
        </Field>
        <Field id="svc-name-ar" label={t('settings.services.nameAr')}>
          <input id="svc-name-ar" className="input" dir="rtl" value={draft.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
        </Field>
        <Field id="svc-desc-fr" label={t('settings.services.descFr')}>
          <textarea id="svc-desc-fr" className="input" rows={2} value={draft.descFr} onChange={(e) => set('descFr', e.target.value)} />
        </Field>
        <Field id="svc-desc-ar" label={t('settings.services.descAr')}>
          <textarea id="svc-desc-ar" className="input" dir="rtl" rows={2} value={draft.descAr} onChange={(e) => set('descAr', e.target.value)} />
        </Field>
        <Field id="svc-category" label={t('settings.services.category')}>
          <select id="svc-category" className="input" value={draft.category} onChange={(e) => set('category', e.target.value as Draft['category'])}>
            <option value="coiffure">{t('settings.services.coiffure')}</option>
            <option value="beaute">{t('settings.services.beaute')}</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="svc-price" label={t('settings.services.price')}>
            <input id="svc-price" className="input" type="number" inputMode="numeric" min={0} step={1} value={draft.price} onChange={(e) => set('price', e.target.value)} />
          </Field>
          <Field id="svc-duration" label={t('settings.services.duration')}>
            <select id="svc-duration" className="input" value={draft.duration} onChange={(e) => set('duration', Number(e.target.value))}>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>{formatDuration(m, lang)}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="svc-order" label={t('settings.services.order')}>
          <input id="svc-order" className="input" type="number" inputMode="numeric" min={0} step={1} value={draft.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" className="btn-primary flex-1" disabled={save.isPending}>{t('settings.services.save')}</button>
          <button type="button" className="btn-secondary flex-1" onClick={() => { setDraft(null); setError(null); }}>{t('settings.services.cancel')}</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      {showAffected && <AffectedBookings />}
      {error && <p role="alert" className="text-sm text-rust-600 mb-3">{error}</p>}
      <button type="button" className="btn-primary w-full mb-4" onClick={() => { setError(null); setDraft(emptyDraft); }}>
        <Plus className="w-4 h-4" strokeWidth={2} aria-hidden /> {t('settings.services.add')}
      </button>
      <ul className="space-y-2">
        {ordered.map((s) => (
          <li key={s.id} className={`card flex items-center gap-2 ps-4 pe-2 py-2 ${s.active ? '' : 'opacity-70'}`}>
            <button
              type="button"
              className="flex-1 min-w-0 text-start py-1"
              onClick={() => { setError(null); setDraft(toDraft(s)); }}
            >
              <span data-testid="service-name" className="block font-medium text-rose-800 truncate">{s.name[lang]}</span>
              <span className="block text-sm text-rose-600">
                {formatPrice(s.price, lang)} · {formatDuration(s.duration, lang)}
                {!s.active && <span className="ms-2 text-xs font-semibold text-amber-800">{t('settings.services.hidden')}</span>}
              </span>
            </button>
            <button type="button" className="btn-ghost btn-sm shrink-0" disabled={setActive.isPending} onClick={() => toggle(s)}>
              {t(s.active ? 'settings.services.hide' : 'settings.services.show')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
    </div>
  );
}
