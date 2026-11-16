import type { ReactNode } from 'react';
import { Globe, SearchX, WifiOff } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { useSiteScope } from '../lib/useSiteScope';

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
  const { toggleLang, t } = useLang();
  useSiteScope();
  return (
    <main className="min-h-screen bg-pearl-50 text-rose-900 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center text-rose-900/60">{icon}</div>
        <h1 className="font-display text-[2rem] leading-tight mb-3">{title}</h1>
        <p className="text-[15px] text-rose-900/65 leading-relaxed mb-8">{body}</p>
        {children}
        <button
          type="button"
          onClick={toggleLang}
          className="mt-4 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[2px] border border-rose-900/30 text-[15px] transition-colors duration-300 hover:border-rose-900"
          aria-label={t('nav.switchLangLabel')}
        >
          <Globe className="w-4 h-4" strokeWidth={1.6} aria-hidden="true" />
          {t('nav.switchLang')}
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
