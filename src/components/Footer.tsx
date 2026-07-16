import { Phone, MapPin, Clock, Instagram, Facebook } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { Thread } from './Thread';

export function Footer() {
  const { t } = useLang();

  return (
    <footer id="contact" className="relative mt-24 bg-rose-900 text-cream-100">
      <div className="absolute top-0 inset-x-0 h-px overflow-hidden">
        <Thread variant="divider" className="w-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="lg:col-span-1">
            <h3 className="font-display text-2xl font-semibold text-cream-50 mb-3">Élégance</h3>
            <p className="text-sm text-cream-200/80 leading-relaxed max-w-xs">{t('hero.subtitle')}</p>
          </div>

          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-cream-100 mb-4 uppercase tracking-wider">
              <MapPin className="w-4 h-4 text-rose-300" strokeWidth={1.8} />
              {t('contact.address')}
            </h4>
            <p className="text-sm text-cream-200/70 leading-relaxed">
              12 Rue Didouche Mourad<br />
              Alger Centre 16000<br />
              Algérie
            </p>
          </div>

          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-cream-100 mb-4 uppercase tracking-wider">
              <Clock className="w-4 h-4 text-rose-300" strokeWidth={1.8} />
              {t('contact.hours')}
            </h4>
            <ul className="space-y-2 text-sm text-cream-200/70">
              <li className="flex justify-between">
                <span>{t('common.tuesday')} – {t('common.friday')}</span>
                <span>9:00 – 18:00</span>
              </li>
              <li className="flex justify-between">
                <span>{t('common.saturday')}</span>
                <span>9:00 – 17:00</span>
              </li>
              <li className="flex justify-between text-cream-400">
                <span>{t('common.sunday')} – {t('common.monday')}</span>
                <span>{t('common.closed')}</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-cream-100 mb-4 uppercase tracking-wider">
              <Phone className="w-4 h-4 text-rose-300" strokeWidth={1.8} />
              {t('contact.phone')}
            </h4>
            <a
              href="tel:+213561234567"
              className="text-sm text-cream-200/80 hover:text-cream-50 transition-colors"
              dir="ltr"
            >
              +213 561 23 45 67
            </a>
            <div className="mt-4">
              <p className="text-xs text-cream-300/60 mb-2 uppercase tracking-wider">{t('contact.follow')}</p>
              <div className="flex gap-3">
                <a
                  href="#"
                  className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-800/60 text-cream-200 hover:bg-rose-700 hover:text-cream-50 transition-all duration-200 ease-silk"
                  aria-label="Instagram"
                >
                  <Instagram className="w-4 h-4" strokeWidth={1.8} />
                </a>
                <a
                  href="#"
                  className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-800/60 text-cream-200 hover:bg-rose-700 hover:text-cream-50 transition-all duration-200 ease-silk"
                  aria-label="Facebook"
                >
                  <Facebook className="w-4 h-4" strokeWidth={1.8} />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-rose-800/50">
          <p className="text-xs text-cream-300/50 text-center">© 2026 Élégance Salon. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}
