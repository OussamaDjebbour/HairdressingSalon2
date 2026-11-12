import type { ReactNode } from 'react';
import { Globe, SearchX, WifiOff } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

/**
 * Startup screens shown instead of the app when no salon could be resolved from the web
 * address. They make no data queries and show no salon's name, photos or contact details.
 */
function StartupScreen({ icon, title, body, children }: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  const { lang, toggleLang } = useLang();
  return (
    <main className="min-h-screen bg-cream-50 flex items-center justify-center px-4 py-12">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-cream-100 text-rose-700">
          {icon}
        </div>
        <h1 className="font-display text-2xl text-rose-800 mb-3">{title}</h1>
        <p className="text-sm text-rose-700/80 mb-6">{body}</p>
        {children}
        <button
          type="button"
          onClick={toggleLang}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-rose-700 bg-cream-100 border border-cream-200 transition-all duration-200 ease-silk hover:bg-cream-200"
          aria-label="Toggle language"
        >
          <Globe className="w-4 h-4" strokeWidth={1.8} />
          <span className={lang === 'fr' ? 'font-semibold text-rose-800' : ''}>FR</span>
          <span className="text-cream-400">|</span>
          <span className={lang === 'ar' ? 'font-semibold text-rose-800' : ''}>AR</span>
        </button>
      </div>
    </main>
  );
}

/** The web address belongs to no salon. */
export function SalonNotFound() {
  const { t } = useLang();
  return (
    <StartupScreen
      icon={<SearchX className="w-7 h-7" strokeWidth={1.6} />}
      title={t('salon.notFound.title')}
      body={t('salon.notFound.body')}
    />
  );
}

/** The salon lookup failed (network or server error). */
export function SalonLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLang();
  return (
    <StartupScreen
      icon={<WifiOff className="w-7 h-7" strokeWidth={1.6} />}
      title={t('salon.loadError.title')}
      body={t('salon.loadError.body')}
    >
      <button type="button" onClick={onRetry} className="btn-primary w-full">
        {t('data.retry')}
      </button>
    </StartupScreen>
  );
}
