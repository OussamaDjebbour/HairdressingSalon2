import { describe, it, expect, vi } from 'vitest';
import { buildPushMessage, handleNotify, pushOptions, type BookingPayload, type PushSubscriptionRow } from './notify';

const booking: BookingPayload = {
  id: 'b1',
  client_name: 'Nour',
  starts_at: '2026-11-07T09:00:00+00:00', // 10:00 in Algiers
  service_name: { fr: 'Manucure & Vernis', ar: 'مانيكير وطلاء الأظافر' },
  stylist_name: 'Sara',
};

const sub = (n: number, lang: 'fr' | 'ar' = 'fr'): PushSubscriptionRow => ({
  endpoint: `https://push.example/${n}`, p256dh: 'k', auth: 'a', lang,
});

describe('buildPushMessage', () => {
  it('uses Algiers time and the subscription language', () => {
    expect(buildPushMessage('new_booking', booking, 'fr')).toEqual({
      title: 'Nouvelle réservation',
      body: 'Nour · Samedi 7 novembre à 10:00\nManucure & Vernis · Sara',
      url: '/admin?day=2026-11-07&booking=b1',
      tag: 'booking-b1',
    });
    const ar = buildPushMessage('new_booking', booking, 'ar');
    expect(ar.title).toBe('حجز جديد');
    expect(ar.body).toContain('السبت 7 نوفمبر على الساعة 10:00');
    expect(ar.body).toContain('مانيكير وطلاء الأظافر · Sara');
  });

  it('names the salon in the title when the payload carries one', () => {
    expect(buildPushMessage('new_booking', { ...booking, salon_name: 'Rival' }, 'fr').title).toBe('Nouvelle réservation · Rival');
    expect(buildPushMessage('new_booking', booking, 'fr').title).toBe('Nouvelle réservation');
  });

  it('uses the salon date late in the UTC evening', () => {
    const late = { ...booking, starts_at: '2026-11-07T23:30:00Z' }; // 00:30 on the 8th in Algiers
    expect(buildPushMessage('new_booking', late, 'fr').url).toBe('/admin?day=2026-11-08&booking=b1');
  });

  it('has a test message in both languages', () => {
    expect(buildPushMessage('test', null, 'fr')).toEqual({
      title: 'Notifications activées',
      body: 'Vous recevrez une alerte à chaque nouvelle réservation en ligne.',
      url: '/admin',
      tag: 'test',
    });
    expect(buildPushMessage('test', null, 'ar').title).toBe('تم تفعيل الإشعارات');
  });
});

describe('handleNotify', () => {
  it('prunes 404/410 endpoints and still sends to the others', async () => {
    const statuses: Record<string, number> = { 'https://push.example/1': 201, 'https://push.example/2': 410, 'https://push.example/3': 500 };
    const send = vi.fn(async (s: PushSubscriptionRow) => statuses[s.endpoint]);
    const prune = vi.fn(async () => {});
    const result = await handleNotify({ kind: 'new_booking', booking, subscriptions: [sub(1), sub(2, 'ar'), sub(3)] }, { send, prune });
    expect(result).toEqual({ sent: 1, failed: 1, pruned: ['https://push.example/2'] });
    expect(prune).toHaveBeenCalledTimes(1);
    expect(prune).toHaveBeenCalledWith(['https://push.example/2']);
    expect(send.mock.calls[1][1].title).toBe('حجز جديد'); // each subscription in its own language
  });

  it('counts a thrown send as failed and keeps going', async () => {
    const send = vi.fn(async (s: PushSubscriptionRow) => {
      if (s.endpoint.endsWith('/1')) throw new Error('network');
      return 201;
    });
    const prune = vi.fn(async () => {});
    const result = await handleNotify({ kind: 'test', booking: null, subscriptions: [sub(1), sub(2)] }, { send, prune });
    expect(result).toEqual({ sent: 1, failed: 1, pruned: [] });
    expect(prune).not.toHaveBeenCalled();
  });
});

describe('pushOptions', () => {
  it('keeps booking alerts for a day at high urgency, so a sleeping or offline phone still gets them', () => {
    expect(pushOptions(buildPushMessage('new_booking', booking, 'fr'))).toEqual({ TTL: 86400, urgency: 'high' });
  });

  it('lets a test push expire quickly', () => {
    expect(pushOptions(buildPushMessage('test', null, 'fr'))).toEqual({ TTL: 60, urgency: 'normal' });
  });
});
