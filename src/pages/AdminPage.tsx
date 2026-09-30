import { Link } from 'react-router-dom';
import { Scissors, Globe, ArrowLeft } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { Schedule } from '../components/Schedule';

export function AdminPage() {
  const { lang, toggleLang, t } = useLang();

  return (
    <div className="min-h-screen flex flex-col bg-cream-50">
      {/* Back-office chrome — burgundy bar signals the staff context */}
      <header className="relative bg-rose-900 text-cream-50">
        <div className="absolute bottom-0 inset-x-0 hairline opacity-50" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-cream-50/10 ring-1 ring-gold-400/40 transition-transform duration-300 ease-silk group-hover:scale-105">
              <Scissors className="w-4 h-4 text-cream-50" strokeWidth={1.6} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display italic text-lg font-semibold text-cream-50">Élégance</span>
              <span className="text-[10px] uppercase tracking-[0.28em] text-gold-300 mt-0.5">
                {t('admin.label')}
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-cream-100 bg-cream-50/10 border border-cream-50/15 transition-colors duration-200 ease-silk hover:bg-cream-50/20"
              aria-label="Toggle language"
            >
              <Globe className="w-4 h-4" strokeWidth={1.8} />
              <span className={lang === 'fr' ? 'font-semibold text-cream-50' : 'text-cream-300'}>FR</span>
              <span className="text-cream-50/30">|</span>
              <span className={lang === 'ar' ? 'font-semibold text-cream-50' : 'text-cream-300'}>AR</span>
            </button>

            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-cream-100 hover:text-gold-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
              <span className="hidden sm:inline">{t('admin.backToSite')}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Schedule />
      </main>
    </div>
  );
}
