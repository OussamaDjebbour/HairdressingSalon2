import { CalendarPlus, ArrowRight, Star } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { SmartImage } from './SmartImage';

// Brand tagline held in both scripts so the hero can show the pairing at once,
// independent of the active language.
const TAGLINE_FR = 'Votre beauté, notre savoir-faire';
const TAGLINE_AR = 'جمالكِ، خبرتنا';

export function Hero() {
  const { t, lang } = useLang();
  const isAr = lang === 'ar';

  const primaryTagline = isAr ? TAGLINE_AR : TAGLINE_FR;
  const counterTagline = isAr ? TAGLINE_FR : TAGLINE_AR;
  const counterIsAr = !isAr;

  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center pt-24 pb-16 overflow-hidden"
    >
      {/* Quiet ground: a single soft gilt glow behind the portal, no blur-blobs */}
      <div className="absolute inset-0 bg-gradient-to-b from-cream-50 to-cream-100" />
      <div className="absolute top-1/4 end-0 w-[38rem] h-[38rem] rounded-full bg-gold-200/20 blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-8 items-center">
          {/* ---- Editorial column ---- */}
          <div className="lg:pe-10 relative">
            <p className="eyebrow rise rise-1">
              Salon de beauté
              <span className="font-arabic tracking-normal text-gold-700 text-sm">
                · صالون تجميل
              </span>
            </p>

            <h1 className="rise rise-2 mt-6 font-display font-semibold text-rose-900 leading-[1.04] text-balance text-[clamp(2.75rem,6vw,4.75rem)]">
              {primaryTagline}
            </h1>

            <div className="rise rise-3 mt-5 mb-4 hairline w-28" />

            {/* The other language as a lighter counterpoint — always in its own face */}
            <p
              className="rise rise-3 text-rose-600 text-[clamp(1.25rem,3vw,1.9rem)] leading-tight"
              dir={counterIsAr ? 'rtl' : 'ltr'}
              lang={counterIsAr ? 'ar' : 'fr'}
              style={{
                fontFamily: counterIsAr ? 'Cairo, sans-serif' : 'Fraunces, serif',
                fontStyle: counterIsAr ? 'normal' : 'italic',
              }}
            >
              {counterTagline}
            </p>

            <p className="rise rise-4 mt-6 text-lg text-rose-700/80 leading-relaxed max-w-md text-pretty">
              {t('hero.subtitle')}
            </p>

            <div className="rise rise-5 flex flex-wrap items-center gap-4 mt-8">
              <a href="#booking" className="btn-primary btn-lg">
                <CalendarPlus className="w-5 h-5" strokeWidth={1.8} />
                {t('hero.cta')}
              </a>
              <a href="#services" className="btn-ghost link-gilt">
                {t('hero.secondary')}
                <ArrowRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
              </a>
            </div>

            {/* One credential, editorial — not a floating glass card */}
            <div className="rise rise-6 flex items-center gap-3 mt-10">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-gold-400 text-gold-400" />
                ))}
              </div>
              <span className="text-sm text-rose-600">
                <span className="font-display font-semibold text-rose-900">4,9</span>
                {' · '}
                {isAr ? '٢٤٠ تقييم' : '240 avis vérifiés'}
              </span>
            </div>
          </div>

          {/* ---- The signature: arched portal portrait ---- */}
          <div className="relative rise rise-4">
            <div className="relative mx-auto max-w-sm lg:max-w-none">
              {/* gilt keyline mat */}
              <div className="arch border border-gold-300/70 p-2.5 bg-cream-50/60 shadow-lift">
                <SmartImage
                  src="https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=900"
                  alt={isAr ? 'صالون الحلاقة والتجميل' : 'Salon de coiffure et beauté'}
                  aspect="aspect-[4/5]"
                  rounded="arch"
                />
              </div>
              {/* keystone dot at the crown of the arch */}
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gold-500 ring-4 ring-cream-50" />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-cream-100 to-transparent pointer-events-none" />
    </section>
  );
}
