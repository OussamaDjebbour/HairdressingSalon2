import { useCallback, useEffect, useState } from 'react';
import type { Lang } from '../context/LanguageContext';
import { supabase } from './supabase';

/** Where this device stands with booking notifications. */
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

const SW_URL = '/sw.js';

function vapidKey(): string {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  );
}

function isSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && vapidKey() !== '';
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob((value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  // iPhones only allow web push for a site opened from the home screen (iOS 16.4+).
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!isSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Asks permission, subscribes this device and saves the subscription for the current staff user. */
export async function enablePush(lang: Lang): Promise<PushState> {
  if (!isSupported()) return 'unsupported';
  await navigator.serviceWorker.register(SW_URL);
  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidKey()) }));
  await saveSubscription(subscription, lang);
  return 'on';
}

async function saveSubscription(subscription: PushSubscription, lang: Lang): Promise<void> {
  const { endpoint, keys } = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await supabase.rpc('admin_save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_lang: lang,
  });
  if (error) throw error;
}

/**
 * Re-saves this device's subscription (an idempotent upsert). Called whenever the admin opens, so if the
 * server dropped it (e.g. after a push service rejection) while the browser still holds it, it comes back
 * instead of the card showing "on" for a device that no longer gets notifications.
 */
export async function syncPushSubscription(lang: Lang): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription) await saveSubscription(subscription, lang);
}

/** Forgets this device on the server, then unsubscribes it. */
export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    const { error } = await supabase.rpc('admin_delete_push_subscription', { p_endpoint: subscription.endpoint });
    if (error) throw error;
    await subscription.unsubscribe();
  }
  return 'off';
}

export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.rpc('admin_send_test_push');
  if (error) throw error;
}

export function usePushState(lang: Lang) {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getPushState()
      .then((s) => {
        if (!alive) return;
        setState(s);
        if (s === 'on') syncPushSubscription(lang).catch(() => undefined);
      })
      .catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
    // Sync once per mount, in the language the admin was opened in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>, onDone?: (result: T) => void) => {
    setBusy(true);
    setError(false);
    try {
      const result = await action();
      onDone?.(result);
    } catch {
      setError(true);
      throw new Error('push_action_failed');
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    state,
    busy,
    error,
    enable: (l: Lang) => run(() => enablePush(l), setState).catch(() => undefined),
    disable: () => run(disablePush, setState).catch(() => undefined),
    /** Rejects if the server refused, so the caller can skip its "sent" message. */
    test: () => run(sendTestPush),
  };
}
