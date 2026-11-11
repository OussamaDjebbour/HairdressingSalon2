import { useLang } from '../../context/LanguageContext';
import { DataError } from '../DataError';

interface SettingsQuery {
  data?: unknown;
  isError?: boolean;
  refetch?: () => unknown;
}

/** True once every query has data (a failed background refetch keeps the cached data). */
export const queriesReady = (queries: SettingsQuery[]) => queries.every((q) => q.data !== undefined);

/**
 * What a settings screen shows until its data is in: a spinner while loading, or a retry when
 * a query failed — never an empty list or blank form that reads as "everything is gone".
 */
export function QueryFallback({ queries }: { queries: SettingsQuery[] }) {
  const { t } = useLang();
  const failed = queries.filter((q) => q.isError && q.data === undefined);
  if (failed.length > 0) {
    return <DataError onRetry={() => failed.forEach((q) => void q.refetch?.())} />;
  }
  return (
    <div role="status" aria-busy="true" className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
      <span className="sr-only">{t('data.loading')}</span>
    </div>
  );
}
