import { useEffect, useState } from 'react';
import { useLang } from '../context/LanguageContext';
import { useSalon } from '../data/salon';

/** Past this share of the screen height the bar leaves the hero photo and turns pearl. */
const HERO_SHARE = 0.6;

/**
 * A quiet bar: the salon name (only once the hero's large name has scrolled away), the other
 * language as a word, and one action. Light on the hero photo, pearl afterwards.
 */
export function Navbar() {
  const { lang, toggleLang, t } = useLang();
  const salon = useSalon();
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > window.innerHeight * HERO_SHARE);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-500 ${
        pastHero ? 'bg-pearl-50/95 backdrop-blur text-rose-900 border-b border-rose-900/10' : 'bg-transparent text-pearl-50'
      }`}
    >
      <nav className="max-w-6xl mx-auto px-6 sm:px-10 h-16 sm:h-20 flex items-center justify-between gap-4">
        <a
          href="#home"
          tabIndex={pastHero ? undefined : -1}
          aria-hidden={pastHero ? undefined : true}
          className={`font-display text-[1.6rem] leading-none truncate transition-opacity duration-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${
            pastHero ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {salon.name[lang]}
        </a>
        <div className="flex items-center gap-4 sm:gap-6 text-[15px] shrink-0">
          <button
            type="button"
            onClick={toggleLang}
            aria-label={t('nav.switchLangLabel')}
            className="min-h-[44px] px-1 opacity-80 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {t('nav.switchLang')}
          </button>
          <a
            href="#booking"
            className={`inline-flex min-h-[44px] items-center px-5 rounded-[2px] border transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${
              pastHero
                ? 'border-rose-900/30 hover:bg-rose-900 hover:text-pearl-50'
                : 'border-pearl-50/40 hover:bg-pearl-50 hover:text-rose-900'
            }`}
          >
            {t('services.book')}
          </a>
        </div>
      </nav>
    </header>
  );
}
