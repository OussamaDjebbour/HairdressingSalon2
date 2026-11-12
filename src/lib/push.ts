import { useCallback, useEffect, useState } from 'react';
import type { Lang } from '../context/LanguageContext';
import { supabase } from './supabase';

/** Where this device stands with booking notifications. */
export type PushState = 'loading' | 'unsupported' | 'not-configured' | 'needs-install' | 'denied' | 'off' | 'on';

const SW_URL = '/sw.js';

function vapidKey(): string {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Chrome on Android may warn that a website notification is "possible spam" (an on-device check). */
export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  );
}

function hasPushApis(): boolean {
  return !!navigator.serviceWorker && 'PushManager' in window && 'Notification' in window;
}

function isSupported(): boolean {
  return hasPushApis() && vapidKey() !== '';
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob((value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!navigator.serviceWorker) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  // iPhones only allow web push for a site opened from the home screen (iOS 16.4+).
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!hasPushApis()) return 'unsupported';
  if (vapidKey() === '') return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Asks permission, subscribes this device and saves the subscription for the current staff user. */
export async function enablePush(lang: Lang): Promise<PushState> {
  if (!isSupported()) return 'unsupported';
  // Ask first: Safari (iPhone) only shows the prompt while the tap still counts as a user gesture,
  // so nothing slow (installing the service worker) may run before it.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  await navigator.serviceWorker.register(SW_URL);
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription()) ?? (await subscribe(registration));
  await saveSubscription(subscription, lang);
  return 'on';
}

function subscribe(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(vapidKey()) });
}

/** Saves the subscription; resolves to whether the server already knew it. `lang: null` keeps the stored language. */
async function saveSubscription(subscription: PushSubscription, lang: Lang | null): Promise<boolean> {
  const { endpoint, keys } = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { data, error } = await supabase.rpc('admin_save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_lang: lang,
  });
  if (error) throw error;
  return data === true;
}

/**
 * Runs whenever the admin opens. Re-saves this device's subscription without changing its language. The server
 * only forgets a device when the push service declared it dead (404/410), so if it was missing, this device's
 * subscription is replaced by a fresh one instead of the card showing "on" for a device that gets nothing.
 */
export async function syncPushSubscription(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  if (await saveSubscription(subscription, null)) return;
  await subscription.unsubscribe();
  const registration = await navigator.serviceWorker.ready;
  await saveSubscription(await subscribe(registration), null);
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

/** Resolves to how many of this user's devices the test went to (0: nothing could be sent). */
export async function sendTestPush(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_send_test_push');
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export function usePushState() {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getPushState()
      .then((s) => {
        if (!alive) return;
        setState(s);
        if (s === 'on') syncPushSubscription().catch(() => undefined);
      })
      .catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>, onDone?: (result: T) => void): Promise<T> => {
    setBusy(true);
    setError(false);
    try {
      const result = await action();
      onDone?.(result);
      return result;
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
    /** Resolves to the number of devices reached; rejects if the server refused. */
    test: () => run(sendTestPush),
  };
}
