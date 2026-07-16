import { CalendarPlus, ArrowRight, Star } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { Thread } from './Thread';
import { SmartImage } from './SmartImage';

export function Hero() {
  const { t, lang } = useLang();

  return (
    <section id="home" className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cream-50 via-cream-100 to-rose-50" />
      <div className="absolute top-20 -right-20 w-96 h-96 rounded-full bg-rose-200/30 blur-3xl" />
      <div className="absolute bottom-10 -left-10 w-72 h-72 rounded-full bg-gold-200/20 blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-6 animate-fadeIn">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-cream-200 shadow-soft">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-gold-400 text-gold-400" />
                ))}
              </div>
              <span className="text-sm font-medium text-rose-700">
                4.9 · {lang === 'ar' ? '٢٤٠ تقييم' : '240 avis'}
              </span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-rose-800 leading-[1.1] text-balance">
              {t('hero.tagline')}
            </h1>

            <Thread variant="accent" className="w-32 h-6 text-rose-400" />

            <p className="text-lg text-rose-600/80 leading-relaxed max-w-lg">{t('hero.subtitle')}</p>

            <div className="flex flex-wrap gap-4 pt-2">
              <a href="#booking" className="btn-primary btn-lg">
                <CalendarPlus className="w-5 h-5" strokeWidth={1.8} />
                {t('hero.cta')}
              </a>
              <a href="#services" className="btn-secondary btn-lg">
                {t('hero.secondary')}
                <ArrowRight className="w-5 h-5" strokeWidth={1.8} />
              </a>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative">
              <SmartImage
                src="https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=800"
                alt="Salon de coiffure"
                aspect="aspect-[4/5]"
                rounded="rounded-3xl"
                className="shadow-lift"
              />
              <div className="absolute -top-6 -left-6 w-44 bg-white/90 backdrop-blur-md rounded-2xl shadow-lift border border-cream-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-rose-100">
                    <Star className="w-5 h-5 text-rose-600" fill="currentColor" />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-semibold text-rose-800">15+</p>
                    <p className="text-xs text-rose-500">{t('trust.years')}</p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 w-48 bg-white/90 backdrop-blur-md rounded-2xl shadow-lift border border-cream-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sage-100">
                    <CalendarPlus className="w-5 h-5 text-sage-600" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-semibold text-rose-800">2 500+</p>
                    <p className="text-xs text-rose-500">{t('trust.clients')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-cream-50 to-transparent pointer-events-none" />
    </section>
  );
}
