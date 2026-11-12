import { useLang } from '../context/LanguageContext';
import { useSalon } from '../data/salon';

export function Philosophy() {
  const { t, lang } = useLang();
  const salon = useSalon();

  if (!salon.story) return null;

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
          {salon.story[lang]}
        </blockquote>

        {salon.storyIntro && (
          <p className="mt-8 text-cream-200/70 text-lg leading-relaxed text-pretty max-w-2xl mx-auto">
            {salon.storyIntro[lang]}
          </p>
        )}

        {salon.founderName && (
          <div className="mt-10 flex items-center justify-center gap-3 text-sm">
            <span className="w-10 hairline" />
            <span className="font-display italic font-semibold text-cream-50">{salon.founderName[lang]}</span>
            {salon.founderRole && <span className="text-cream-300/70">· {salon.founderRole[lang]}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
