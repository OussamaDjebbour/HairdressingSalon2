import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { isNotAuthorized, useMySalon } from '../../data/admin';
import { SALON_ID } from '../../data/salon';
import { AdminShell } from '../admin/AdminShell';

/** Staff of another salon must never see (or edit) this salon's settings. */
function SalonGate({ userId, children }: { userId: string; children: ReactNode }) {
  const { t } = useLang();
  const mySalon = useMySalon(userId);
  if (mySalon.isLoading) return <div className="py-20" aria-busy="true" />;
  if (mySalon.isError && isNotAuthorized(mySalon.error)) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.notAuthorized')}</p>;
  }
  if (mySalon.data !== undefined && mySalon.data !== SALON_ID) {
    return <p className="text-center text-rose-600 py-20 px-4">{t('admin.otherSalon')}</p>;
  }
  return <>{children}</>;
}

/** Admin chrome + login/salon guard + a title bar with a back arrow, for every settings screen. */
export function SettingsLayout({ title, backTo, children }: { title: string; backTo: string; children: ReactNode }) {
  const { t } = useLang();
  return (
    <AdminShell>
      {(userId) => (
        <SalonGate userId={userId}>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
            <div className="flex items-center gap-2 mb-5">
              <Link
                to={backTo}
                aria-label={t('settings.back')}
                className="flex items-center justify-center w-10 h-10 -ms-2 rounded-full text-rose-800 hover:bg-cream-100 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 rtl:rotate-180" strokeWidth={1.8} />
              </Link>
              <h1 className="font-display text-2xl font-semibold text-rose-800">{title}</h1>
            </div>
            {children}
          </div>
        </SalonGate>
      )}
    </AdminShell>
  );
}
