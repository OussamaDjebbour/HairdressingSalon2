import type { ReactNode } from 'react';
import { useLang } from '../../context/LanguageContext';
import { isNotAuthorized, useMySalon } from '../../data/admin';
import { SALON_ID } from '../../data/salon';
import { DataError } from '../DataError';

/**
 * The one salon-isolation gate for the back office. Fails closed: children render only
 * when the account is confirmed staff of this deployment's salon. Once confirmed, a failed
 * background refetch (e.g. a network blip after a save) keeps the verified screen; an explicit
 * not_authorized always wins.
 */
export function SalonGate({ userId, children }: { userId: string; children: ReactNode }) {
  const { t } = useLang();
  const mySalon = useMySalon(userId);
  if (mySalon.isError && isNotAuthorized(mySalon.error)) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.notAuthorized')}</p>;
  }
  if (mySalon.data === undefined) {
    if (mySalon.isError) return <DataError onRetry={() => void mySalon.refetch()} />;
    return <div className="py-20" aria-busy="true" />;
  }
  if (mySalon.data !== SALON_ID) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.otherSalon')}</p>;
  }
  return <>{children}</>;
}
