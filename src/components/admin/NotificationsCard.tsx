import { useState } from 'react';
import { BellRing, BellOff, Smartphone } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { useMyRole } from '../../data/admin';
import { useSalon } from '../../data/salon';
import { usePushState } from '../../lib/push';

/** Lets the owner turn on booking notifications for this device (with iPhone guidance). */
export function NotificationsCard() {
  const { lang, t } = useLang();
  const salon = useSalon();
  const role = useMyRole();
  const { state, enable, disable, test, busy, error } = usePushState();
  const [testResult, setTestResult] = useState<'sent' | 'nothing' | null>(null);

  const sendTest = async () => {
    setTestResult(null);
    try {
      setTestResult((await test()) > 0 ? 'sent' : 'nothing');
    } catch {
      // the hook already flags the error
    }
  };

  if (state === 'loading') return null;

  const Icon = state === 'on' ? BellRing : state === 'needs-install' ? Smartphone : BellOff;

  return (
    <section aria-label={t('admin.push.title')} className="max-w-3xl mx-auto mb-4 rounded-2xl bg-white border border-cream-200 shadow-soft px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-full bg-cream-100 border border-gold-200/70 flex-shrink-0">
          <Icon className="w-4 h-4 text-gold-600" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold text-rose-800">
            {state === 'needs-install' ? t('admin.push.iosTitle') : t('admin.push.title')}
          </p>

          {state === 'needs-install' && (
            <ol className="mt-1 list-decimal ps-5 space-y-0.5 text-rose-700">
              <li>{t('admin.push.iosStep1')}</li>
              <li>{t('admin.push.iosStep2')}</li>
              <li>{t('admin.push.iosStep3').replace('{salon}', salon.name[lang])}</li>
            </ol>
          )}

          {state === 'off' && role === 'demo' && <p className="mt-1 text-rose-700">{t('admin.push.demoDisabled')}</p>}

          {state === 'off' && role !== 'demo' && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-rose-700">{t('admin.push.offText')}</p>
              <button type="button" disabled={busy} onClick={() => enable(lang)} className="btn-primary btn-sm">
                {t('admin.push.enable')}
              </button>
            </div>
          )}

          {state === 'on' && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sage-700">{t('admin.push.on')}</p>
              <button type="button" disabled={busy} onClick={sendTest} className="text-rose-700 underline underline-offset-2 hover:text-rose-900">
                {t('admin.push.test')}
              </button>
              <button type="button" disabled={busy} onClick={() => disable()} className="text-rose-600 hover:text-rose-800">
                {t('admin.push.disable')}
              </button>
            </div>
          )}

          {state === 'denied' && <p className="mt-1 text-rose-700">{t('admin.push.denied')}</p>}
          {state === 'unsupported' && <p className="mt-1 text-rose-700">{t('admin.push.unsupported')}</p>}
          {state === 'not-configured' && <p className="mt-1 text-rose-700">{t('admin.push.notConfigured')}</p>}
          {testResult && state === 'on' && (
            <p className="mt-1 text-xs text-rose-600" role="status">
              {t(testResult === 'sent' ? 'admin.push.testSent' : 'admin.push.testNothing')}
            </p>
          )}
          {error && <p className="mt-1 text-xs text-rust-700" role="alert">{t('admin.error.unknown')}</p>}
        </div>
      </div>
    </section>
  );
}
