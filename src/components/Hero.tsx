import { translations, useLang } from '../context/LanguageContext';
import { useSalon } from '../data/salon';
import { useSalonInfo } from '../data/salonSettings';
import { claimsSentence, heroLine } from '../data/formatters';

/**
 * The first screen: the salon's own photo full height, its name very large, the tagline in both
 * languages, one action. The brand colour rises from the bottom so the type sits on the photo.
 */
export function Hero() {
  const { t, lang } = useLang();
  const salon = useSalon();
  const city = useSalonInfo().data?.city[lang];
  const claims = claimsSentence(t, lang, salon.yearsOpen, salon.clientCount, city);

  return (
    <section id="home" className="relative min-h-[100svh] flex items-end overflow-hidden bg-rose-900 text-pearl-50">
      {salon.heroImage && (
        <>
          <img
            src={salon.heroImage}
            alt=""
            fetchPriority="high"
            className="hero-settle absolute inset-0 h-full w-full object-cover object-[50%_25%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-rose-900 via-rose-900/55 via-40% to-rose-900/10" />
        </>
      )}

      <div className="relative w-full max-w-6xl mx-auto px-6 sm:px-10 pt-32 pb-14 sm:pb-20">
        <h1 className="hero-name font-display leading-[0.95] tracking-[-0.02em] text-[clamp(3.5rem,16vw,10rem)] text-balance">
          {salon.name[lang]}
        </h1>

        <div className="hero-sub mt-6 sm:mt-8 max-w-xl space-y-1.5">
          {/* Both lines keep their own direction but line up on the page's start edge. */}
          <p lang="fr" dir="ltr" className={`font-display italic text-[clamp(1.25rem,4.5vw,1.9rem)] text-pearl-50/90 ${lang === 'ar' ? 'text-end' : 'text-start'}`}>
            {translations.fr['hero.tagline']}
          </p>
          <p lang="ar" dir="rtl" className={`font-[Amiri] text-[clamp(1.35rem,5vw,2rem)] text-gold-200 ${lang === 'ar' ? 'text-start' : 'text-end'}`}>
            {translations.ar['hero.tagline']}
          </p>
        </div>

        <div className="hero-sub mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
          <a
            href="#booking"
            className="inline-flex items-center justify-center min-h-[52px] px-8 rounded-[2px] bg-gold-200 text-rose-900 text-[15px] tracking-[0.02em] transition-colors duration-300 hover:bg-pearl-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-200"
          >
            {t('hero.cta')}
          </a>
          <a
            href="#services"
            className="inline-flex items-center min-h-[44px] text-[15px] text-pearl-50/85 underline decoration-gold-200/60 underline-offset-[6px] hover:text-pearl-50 hover:decoration-gold-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-200"
          >
            {t('hero.secondary')}
          </a>
        </div>

        <p className="hero-sub mt-12 text-sm text-pearl-50/65">{heroLine(t, city, salon.rating)}</p>
        {/* Without a story there is no "La maison" section: the claims sit here instead. */}
        {!salon.story && claims && <p className="hero-sub mt-1.5 text-sm text-pearl-50/65">{claims}</p>}
      </div>
    </section>
  );
}
