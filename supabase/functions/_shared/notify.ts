// Shared by the notify-booking Edge Function (Deno) and its Vitest tests (Node).
// Keep it free of Deno-only imports and of imports from src/ (the function can't bundle them).

export type Lang = 'fr' | 'ar';

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: Lang;
}

export interface BookingPayload {
  id: string;
  client_name: string;
  starts_at: string;
  service_name: Record<Lang, string>;
  stylist_name: string;
}

export interface NotifyRequest {
  kind: 'new_booking' | 'test';
  booking: BookingPayload | null;
  subscriptions: PushSubscriptionRow[];
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

// Same names as src/data/formatters.ts (formatLongDate), copied because the function can't import src/.
const dayNames: Record<Lang, string[]> = {
  fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};
const monthNames: Record<Lang, string[]> = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  ar: ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

const salonYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' });
const salonTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit', hour12: false });

/** Salon (Africa/Algiers) calendar date and time of an instant, whatever timezone the runtime uses. */
function salonParts(iso: string) {
  const d = new Date(iso);
  const ymd = salonYmd.format(d);
  const [y, m, day] = ymd.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return { ymd, day, month: m - 1, weekday, time: salonTime.format(d) };
}

const copy = {
  fr: {
    newTitle: 'Nouvelle réservation',
    when: (date: string, time: string) => `${date} à ${time}`,
    testTitle: 'Notifications activées',
    testBody: 'Vous recevrez une alerte à chaque nouvelle réservation en ligne.',
  },
  ar: {
    newTitle: 'حجز جديد',
    when: (date: string, time: string) => `${date} على الساعة ${time}`,
    testTitle: 'تم تفعيل الإشعارات',
    testBody: 'ستتلقين تنبيهًا عند كل حجز جديد عبر الموقع.',
  },
} as const;

export function buildPushMessage(kind: NotifyRequest['kind'], booking: BookingPayload | null, lang: Lang): PushMessage {
  const c = copy[lang] ?? copy.fr;
  if (kind === 'test' || !booking) {
    return { title: c.testTitle, body: c.testBody, url: '/admin', tag: 'test' };
  }
  const p = salonParts(booking.starts_at);
  const date = `${dayNames[lang][p.weekday]} ${p.day} ${monthNames[lang][p.month]}`;
  return {
    title: c.newTitle,
    body: `${booking.client_name} · ${c.when(date, p.time)}\n${booking.service_name[lang]} · ${booking.stylist_name}`,
    url: `/admin?day=${p.ymd}&booking=${booking.id}`,
    tag: `booking-${booking.id}`,
  };
}

export interface NotifyDeps {
  /** Sends one push; resolves to the push service's HTTP status. */
  send(sub: PushSubscriptionRow, msg: PushMessage): Promise<number>;
  /** Deletes subscriptions the push service reported as gone. */
  prune(endpoints: string[]): Promise<void>;
}

/** Sends every subscription its message in its own language; prunes 404/410 endpoints. */
export async function handleNotify(req: NotifyRequest, deps: NotifyDeps): Promise<{ sent: number; failed: number; pruned: string[] }> {
  let sent = 0;
  let failed = 0;
  const pruned: string[] = [];
  await Promise.all(
    req.subscriptions.map(async (sub) => {
      try {
        const status = await deps.send(sub, buildPushMessage(req.kind, req.booking, sub.lang));
        if (status >= 200 && status < 300) sent++;
        else if (status === 404 || status === 410) pruned.push(sub.endpoint);
        else failed++;
      } catch {
        failed++;
      }
    })
  );
  if (pruned.length > 0) await deps.prune(pruned);
  return { sent, failed, pruned };
}
