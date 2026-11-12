import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { useLogout } from '../../lib/useLogout';
import { isNotAuthorized, useMySalon } from '../../data/admin';
import { currentSalonId } from '../../data/salon';
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
    return <Blocked message={t('admin.notAuthorized')} />;
  }
  if (mySalon.data === undefined) {
    if (mySalon.isError) {
      return (
        <>
          <DataError onRetry={() => void mySalon.refetch()} />
          <LogoutButton />
        </>
      );
    }
    return <div className="py-20" aria-busy="true" />;
  }
  if (mySalon.data !== currentSalonId()) {
    return <Blocked message={t('admin.otherSalon')} />;
  }
  return <>{children}</>;
}

/** The account can't use this salon's back office: say why, and let it sign out to use the right account. */
export function Blocked({ message }: { message: string }) {
  return (
    <div className="py-20 px-4 text-center">
      <p className="text-rose-600">{message}</p>
      <LogoutButton />
    </div>
  );
}

/** The header has no logout (it lives in Réglages), so every blocked screen offers one. */
function LogoutButton() {
  const { t } = useLang();
  const logout = useLogout();
  return (
    <div className="mt-4 flex justify-center">
      <button type="button" onClick={() => void logout()} className="btn-secondary btn-sm">
        <LogOut className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} aria-hidden="true" />
        {t('admin.logout')}
      </button>
    </div>
  );
}
