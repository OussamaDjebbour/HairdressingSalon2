import { useLang } from '../context/LanguageContext';
import { useSalon } from '../data/salon';
import { useStylists } from '../data/queries';
import { formatNumber } from '../data/formatters';

export function TrustBadges() {
  const { t, lang } = useLang();

  const salon = useSalon();
  const stylistCount = useStylists().data?.length ?? 0;

  // Claims the salon left empty are left out; the stylist count is always the live number of active stylists.
  const stats: { value: string; label: string }[] = [];
  if (salon.yearsOpen !== null) stats.push({ value: `${formatNumber(salon.yearsOpen, lang)}+`, label: t('trust.years') });
  if (salon.clientCount !== null) stats.push({ value: `${formatNumber(salon.clientCount, lang)}+`, label: t('trust.clients') });
  if (stylistCount > 0) stats.push({ value: formatNumber(stylistCount, lang), label: t('trust.stylists') });
  if (salon.rating !== null) stats.push({ value: formatNumber(salon.rating, lang), label: t('trust.reviews') });

  if (stats.length === 0) return null;

  return (
    <section className="relative py-16 lg:py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="eyebrow eyebrow-center justify-center mx-auto mb-10">
          {t('trust.kicker')}
        </p>
        <div className="flex flex-wrap justify-center gap-y-10">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="text-center px-4 basis-1/2 lg:basis-auto lg:min-w-[12rem] lg:border-e lg:border-gold-200/60 last:lg:border-e-0"
            >
              <p className="font-display font-semibold text-rose-900 leading-none text-[clamp(2.5rem,5vw,3.25rem)]">
                {stat.value}
              </p>
              <p className="mt-3 text-[0.7rem] uppercase tracking-[0.2em] text-rose-600">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
