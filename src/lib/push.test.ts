import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from './supabase';
import { disablePush, enablePush, getPushState, sendTestPush, syncPushSubscription } from './push';

const rpc = supabase.rpc as ReturnType<typeof vi.fn>;
const VAPID = 'BCNkBvAINq_qVYDVsX4rFPBmoPhrt-HhmE31x-kpy8C22yZ_WfUjqHBL6tpLhaOWYSD-RMCaxyIiCiu_Jb4j8oI';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';

let subscription: { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> } | null;
let permission: NotificationPermission;
const requestPermission = vi.fn();
const subscribe = vi.fn();

function setUserAgent(ua: string, platform = 'MacIntel', touchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', VAPID);
  setUserAgent(DESKTOP_UA);
  subscription = null;
  permission = 'default';
  rpc.mockResolvedValue({ data: null, error: null });
  requestPermission.mockImplementation(async () => {
    permission = 'granted';
    return permission;
  });
  let created = 0;
  subscribe.mockImplementation(async () => {
    const endpoint = created++ === 0 ? 'https://push.example/abc' : `https://push.example/new${created}`;
    subscription = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'p256-b64url', auth: 'auth-b64url' } }),
      unsubscribe: vi.fn(async () => true),
    };
    return subscription;
  });
  const registration = { pushManager: { getSubscription: async () => subscription, subscribe } };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register: vi.fn(async () => registration), getRegistration: vi.fn(async () => registration), ready: Promise.resolve(registration) },
    configurable: true,
  });
  Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true });
  Object.defineProperty(window, 'Notification', {
    value: { get permission() { return permission; }, requestPermission },
    configurable: true,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('getPushState', () => {
  it('asks iPhone users to add the site to the home screen first', async () => {
    setUserAgent(IPHONE_UA, 'iPhone', 5);
    expect(await getPushState()).toBe('needs-install');
  });

  it('reports blocked notifications', async () => {
    permission = 'denied';
    expect(await getPushState()).toBe('denied');
  });

  it('is off until this device subscribes', async () => {
    expect(await getPushState()).toBe('off');
  });

  it('reports missing site configuration separately from an unsupported browser', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    expect(await getPushState()).toBe('not-configured');
  });
});

describe('enablePush', () => {
  it('asks permission first, while the tap still counts as a user gesture (iPhone)', async () => {
    await enablePush('fr');
    const register = navigator.serviceWorker.register as ReturnType<typeof vi.fn>;
    expect(requestPermission.mock.invocationCallOrder[0]).toBeLessThan(register.mock.invocationCallOrder[0]);
  });

  it('enablePush saves the subscription', async () => {
    expect(await enablePush('ar')).toBe('on');
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(subscribe.mock.calls[0][0].applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(rpc).toHaveBeenCalledWith('admin_save_push_subscription', {
      p_endpoint: 'https://push.example/abc', p_p256dh: 'p256-b64url', p_auth: 'auth-b64url', p_lang: 'ar',
    });
    expect(await getPushState()).toBe('on');
  });

  it('stops when permission is refused', async () => {
    requestPermission.mockImplementation(async () => {
      permission = 'denied';
      return permission;
    });
    expect(await enablePush('fr')).toBe('denied');
    expect(subscribe).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('disablePush', () => {
  it('unsubscribes this device and forgets it on the server', async () => {
    await enablePush('fr');
    const current = subscription!;
    rpc.mockClear();
    expect(await disablePush()).toBe('off');
    expect(current.unsubscribe).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('admin_delete_push_subscription', { p_endpoint: 'https://push.example/abc' });
  });
});

describe('syncPushSubscription', () => {
  it('re-saves this device without touching the language she chose', async () => {
    await enablePush('ar');
    rpc.mockClear();
    rpc.mockResolvedValue({ data: true, error: null }); // the server still knows this device
    await syncPushSubscription();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('admin_save_push_subscription', {
      p_endpoint: 'https://push.example/abc', p_p256dh: 'p256-b64url', p_auth: 'auth-b64url', p_lang: null,
    });
  });

  it('re-subscribes when the server had dropped this device as dead', async () => {
    await enablePush('fr');
    const dead = subscription!;
    rpc.mockClear();
    rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValue({ data: false, error: null });
    await syncPushSubscription();
    expect(dead.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith('admin_save_push_subscription', expect.objectContaining({
      p_endpoint: 'https://push.example/new2', p_lang: null,
    }));
  });

  it('does nothing when this device is not subscribed', async () => {
    await syncPushSubscription();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('sendTestPush', () => {
  it('resolves to how many devices the test went to', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    expect(await sendTestPush()).toBe(2);
  });
});

describe('disablePush without service workers', () => {
  it('is a no-op on browsers without service worker support', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
    expect(await disablePush()).toBe('off');
    expect(rpc).not.toHaveBeenCalled();
  });
});
