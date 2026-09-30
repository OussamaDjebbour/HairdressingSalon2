import { useLang } from '../context/LanguageContext';

export function TrustBadges() {
  const { t, lang } = useLang();

  const stats = [
    { value: '15+', label: t('trust.years') },
    { value: '2 500+', label: t('trust.clients') },
    { value: lang === 'ar' ? '٣' : '3', label: t('trust.stylists') },
    { value: '4,9', label: t('trust.reviews') },
  ];

  return (
    <section className="relative py-16 lg:py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="eyebrow eyebrow-center justify-center mx-auto mb-10">
          {t('trust.kicker')}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-10">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="text-center px-4 lg:border-e lg:border-gold-200/60 last:lg:border-e-0"
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
