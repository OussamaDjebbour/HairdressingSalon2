import { describe, it, expect, vi } from 'vitest';
import swSource from '../../public/sw.js?raw';

type Handler = (event: unknown) => void;

/** Evaluates public/sw.js against a fake service-worker global and returns its handlers. */
function loadSw(windowClients: unknown[] = []) {
  const handlers: Record<string, Handler> = {};
  const showNotification = vi.fn(() => Promise.resolve());
  const openWindow = vi.fn(() => Promise.resolve(null));
  const self = {
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    registration: { showNotification },
    clients: { matchAll: vi.fn(() => Promise.resolve(windowClients)), openWindow, claim: vi.fn() },
    skipWaiting: vi.fn(),
    location: { origin: 'https://salon.example' },
  };
  new Function('self', swSource)(self);
  return { handlers, showNotification, openWindow };
}

async function dispatch(handler: Handler, event: Record<string, unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  handler({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
}

const message = { title: 'Nouvelle réservation', body: 'Nour · Samedi 7 novembre à 10:00', url: '/admin?day=2026-11-07&booking=b1', tag: 'booking-b1' };

describe('service worker', () => {
  it('push shows the notification', async () => {
    const { handlers, showNotification } = loadSw();
    await dispatch(handlers.push, { data: { json: () => message } });
    expect(showNotification).toHaveBeenCalledWith(
      'Nouvelle réservation',
      expect.objectContaining({ body: message.body, tag: 'booking-b1', data: { url: message.url } })
    );
  });

  it('notificationclick focuses an open admin tab', async () => {
    const client = { url: 'https://salon.example/admin', focus: vi.fn(), navigate: vi.fn() };
    client.focus.mockResolvedValue(client);
    const { handlers, openWindow } = loadSw([client]);
    const close = vi.fn();
    await dispatch(handlers.notificationclick, { notification: { close, data: { url: message.url } } });
    expect(close).toHaveBeenCalled();
    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith(message.url);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('opens a new window if the open admin tab cannot be navigated', async () => {
    const client = { url: 'https://salon.example/admin', focus: vi.fn(), navigate: vi.fn(() => Promise.reject(new TypeError('not controlled'))) };
    client.focus.mockResolvedValue(client);
    const { handlers, openWindow } = loadSw([client]);
    await dispatch(handlers.notificationclick, { notification: { close: vi.fn(), data: { url: message.url } } });
    expect(openWindow).toHaveBeenCalledWith(message.url);
  });

  it('notificationclick opens a window when none is open', async () => {
    const { handlers, openWindow } = loadSw([{ url: 'https://salon.example/', focus: vi.fn(), navigate: vi.fn() }]);
    await dispatch(handlers.notificationclick, { notification: { close: vi.fn(), data: { url: message.url } } });
    expect(openWindow).toHaveBeenCalledWith(message.url);
  });
});
