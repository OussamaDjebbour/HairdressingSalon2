import { useLang } from '../context/LanguageContext';
import { useSalon } from '../data/salon';
import { useSalonInfo } from '../data/salonSettings';
import { claimsSentence, heroLine } from '../data/formatters';

/**
 * The first screen: the salon's own photo full height, its name very large, the tagline in the
 * page's language, one action. The brand colour rises from the bottom so the type sits on the photo.
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
            {...{ fetchpriority: 'high' }}
            className="hero-settle absolute inset-0 h-full w-full object-cover object-[50%_25%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-rose-900 via-rose-900/55 via-40% to-rose-900/10" />
          {/* A bright photo top must not swallow the transparent bar's light text. */}
          <div data-top-scrim className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-rose-900/50 to-transparent" />
          {/* Wide screens: the type sits beside the subject, so the reading side gets a soft shade too. */}
          <div className="hidden lg:block absolute inset-0 bg-gradient-to-r rtl:bg-gradient-to-l from-rose-900/70 via-rose-900/25 via-45% to-transparent" />
        </>
      )}

      <div className="relative w-full max-w-6xl mx-auto px-6 sm:px-10 pt-32 pb-14 sm:pb-20">
        <h1 className="hero-name font-display leading-[0.95] tracking-[-0.02em] text-[clamp(3.5rem,16vw,10rem)] text-balance">
          {salon.name[lang]}
        </h1>

        {/* One tagline, in the page's language (Arabic falls through to Amiri; no italic for it). */}
        <p
          className={`hero-sub mt-6 sm:mt-8 max-w-xl text-pearl-50/90 ${
            lang === 'ar' ? 'font-[Amiri] text-[clamp(1.35rem,5vw,2rem)]' : 'font-display italic text-[clamp(1.25rem,4.5vw,1.9rem)]'
          }`}
        >
          {t('hero.tagline')}
        </p>

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

        <p className="hero-sub mt-8 text-sm text-pearl-50/70 max-w-md">{heroLine(t, lang, city, salon.rating, salon.reviewCount)}</p>
        {/* Without a story there is no "La maison" section: the claims sit here instead. */}
        {!salon.story && claims && <p className="hero-sub mt-1.5 text-sm text-pearl-50/65">{claims}</p>}
      </div>
    </section>
  );
}
