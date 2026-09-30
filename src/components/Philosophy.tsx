import { useLang } from '../context/LanguageContext';

export function Philosophy() {
  const { t } = useLang();

  return (
    <section className="relative py-24 lg:py-32 bg-rose-900 text-cream-100 overflow-hidden">
      {/* gilt hairline crowning the band */}
      <div className="absolute top-0 inset-x-0 hairline opacity-50" />

      {/* the arch, echoed once — a faint gilt keyline framing the words */}
      <div
        aria-hidden
        className="absolute left-1/2 top-10 -translate-x-1/2 w-[min(92%,42rem)] h-[78%] arch border border-gold-400/20"
      />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p className="eyebrow eyebrow-center justify-center mx-auto mb-8 !text-gold-300">
          {t('philosophy.kicker')}
        </p>

        <blockquote className="font-display italic font-medium text-cream-50 text-[clamp(1.75rem,4vw,3rem)] leading-[1.15] text-balance">
          {t('philosophy.quote')}
        </blockquote>

        <p className="mt-8 text-cream-200/70 text-lg leading-relaxed text-pretty max-w-2xl mx-auto">
          {t('philosophy.body')}
        </p>

        <div className="mt-10 flex items-center justify-center gap-3 text-sm">
          <span className="w-10 hairline" />
          <span className="font-display italic font-semibold text-cream-50">
            {t('philosophy.author')}
          </span>
          <span className="text-cream-300/70">· {t('philosophy.role')}</span>
        </div>
      </div>
    </section>
  );
}
