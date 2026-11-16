import { Controller, type Control, type FieldErrors, type FieldValues, type Path, type UseFormRegister } from 'react-hook-form';
import { ChevronRight } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { toYmd } from '../../data/bookings';
import { algiersTodayYmd } from '../../data/algiersTime';
import { formatDuration, formatPrice } from '../../data/formatters';
import type { Period } from '../../data/period';
import type { Service } from '../../data/types';
import { TextField } from '../form/TextField';
import { DateRangeField } from '../form/DateRangeField';
import type { SaveServiceInput } from '../../data/salonSettings';

/** The promotion part of a service/pack form, as typed values. */
export interface PromoValues {
  promoPrice: string;
  promoPeriod: Period | null;
}

export const emptyPromo: PromoValues = { promoPrice: '', promoPeriod: null };

const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function promoToValues(s: Service): PromoValues {
  return s.promo
    ? { promoPrice: String(s.promo.price), promoPeriod: { from: fromYmd(s.promo.from), to: fromYmd(s.promo.to) } }
    : emptyPromo;
}

export function promoToInput(v: PromoValues): SaveServiceInput['promo'] {
  if (v.promoPrice.trim() === '' || !v.promoPeriod) return null;
  return { price: parseInt(v.promoPrice.trim(), 10), from: toYmd(v.promoPeriod.from), to: toYmd(v.promoPeriod.to) };
}

/** Price + days of a promotion. Both empty = no promotion. */
export function PromoFields<T extends FieldValues & PromoValues>({
  idPrefix, register, control, errors,
}: {
  idPrefix: string;
  register: UseFormRegister<T>;
  control: Control<T>;
  errors: FieldErrors<T>;
}) {
  const { t } = useLang();
  return (
    <fieldset className="space-y-3">
      <legend className="label">{t('settings.promo.title')}</legend>
      <TextField
        id={`${idPrefix}-promo-price`}
        label={t('settings.promo.price')}
        optional
        inputMode="numeric"
        error={errors.promoPrice?.message as string | undefined}
        {...register('promoPrice' as Path<T>)}
      />
      <Controller
        control={control}
        name={'promoPeriod' as Path<T>}
        render={({ field }) => (
          <DateRangeField
            id={`${idPrefix}-promo-days`}
            label={t('settings.promo.days')}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            error={errors.promoPeriod?.message as string | undefined}
          />
        )}
      />
    </fieldset>
  );
}

/** One catalogue row: the whole row opens the form, a separate button hides/shows. */
export function CatalogRow({
  s, onOpen, onToggle, toggling,
}: { s: Service; onOpen(): void; onToggle(): void; toggling: boolean }) {
  const { t, lang } = useLang();
  const today = algiersTodayYmd();
  const promo = s.promo && s.promo.to >= today ? s.promo : null;
  const running = promo !== null && promo.from <= today;
  return (
    <li className={`card relative flex items-center gap-2 ps-4 pe-3 py-2 ${s.active ? '' : 'opacity-70'}`}>
      <button
        type="button"
        className="flex-1 min-w-0 text-start py-1 after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
        onClick={onOpen}
      >
        <span className="flex-1 min-w-0">
          <span data-testid="service-name" className="block font-medium text-rose-800 break-words">{s.name[lang]}</span>
          <span className="block text-sm text-rose-600">
            {formatPrice(s.price, lang)} · {formatDuration(s.duration, lang)}
            {!s.active && <span className="ms-2 text-xs font-semibold text-amber-800">{t('settings.services.hidden')}</span>}
          </span>
          {promo && (
            <span className="block text-xs font-semibold text-gold-700">
              {t(running ? 'settings.promo.running' : 'settings.promo.upcoming')} · {formatPrice(promo.price, lang)}
            </span>
          )}
        </span>
      </button>
      <button type="button" className="btn-ghost btn-sm tap relative z-10 shrink-0" disabled={toggling} onClick={onToggle}>
        {t(s.active ? 'settings.services.hide' : 'settings.services.show')}
      </button>
      <ChevronRight className="w-4 h-4 shrink-0 text-gold-600 rtl:rotate-180" strokeWidth={1.8} aria-hidden="true" />
    </li>
  );
}
