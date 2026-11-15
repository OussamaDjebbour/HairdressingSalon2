import { useId } from 'react';
import { Check } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { formatDuration } from '../../data/formatters';
import type { Service, Stylist } from '../../data/types';

interface Props {
  visit: Service[];
  stylists: Stylist[];
  value: Record<string, string | null>;
  onChange(serviceId: string, stylistId: string | null): void;
}

/** One row per part of the visit: the staff who offer that service, plus "no preference". */
export function VisitStylists({ visit, stylists, value, onChange }: Props) {
  const { lang, t } = useLang();
  const baseId = useId();
  return (
    <div className="space-y-5">
      {visit.map((service, i) => {
        const headingId = `${baseId}-${i}`;
        const chosen = value[service.id] ?? null;
        const options: { id: string | null; label: string }[] = [
          { id: null, label: t('booking.noPreference') },
          ...stylists.filter((s) => s.serviceIds.includes(service.id)).map((s) => ({ id: s.id, label: s.name })),
        ];
        return (
          <div key={service.id} role="group" aria-labelledby={headingId}>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h4 id={headingId} className="font-medium text-rose-800 text-sm">{service.name[lang]}</h4>
              <span className="flex-shrink-0 text-xs text-rose-600">{formatDuration(service.duration, lang)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const selected = chosen === o.id;
                return (
                  <button
                    key={o.id ?? ''}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(service.id, o.id)}
                    className={`tap inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ease-silk ${
                      selected
                        ? 'border-gold-400 bg-gold-50 text-rose-800 ring-1 ring-gold-300'
                        : 'border-cream-200 bg-cream-50 text-rose-700 hover:border-gold-200'
                    }`}
                  >
                    {selected && <Check aria-hidden="true" className="w-3.5 h-3.5 text-gold-600" strokeWidth={2.5} />}
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
