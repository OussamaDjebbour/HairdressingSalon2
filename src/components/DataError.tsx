import { useLang } from '../context/LanguageContext';

export function DataError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLang();
  return (
    <div className="text-center py-12">
      <p className="text-rose-600 mb-4">{t('data.error')}</p>
      <button onClick={onRetry} className="btn-secondary">
        {t('data.retry')}
      </button>
    </div>
  );
}
