// notify-booking: sends Web Push notifications to the owner's devices.
// Called only by the database (private.post_push via pg_net), authenticated with the x-notify-secret header.
// Stateless: the request carries the booking and the subscriptions; dead subscriptions are pruned via RPC.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleNotify, type NotifyRequest, type PushMessage, type PushSubscriptionRow } from '../_shared/notify.ts';

const env = (name: string) => Deno.env.get(name) ?? '';

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0 && x.length > 0;
}

function isNotifyRequest(v: unknown): v is NotifyRequest {
  const r = v as NotifyRequest;
  return (
    typeof r === 'object' && r !== null &&
    (r.kind === 'new_booking' || r.kind === 'test') &&
    Array.isArray(r.subscriptions) &&
    (r.booking === null || typeof r.booking === 'object')
  );
}

async function send(sub: PushSubscriptionRow, msg: PushMessage): Promise<number> {
  try {
    const res = await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(msg),
      { TTL: 30 }
    );
    return res.statusCode;
  } catch (err) {
    // web-push throws WebPushError for non-2xx answers; 404/410 mean the subscription is gone.
    const status = (err as { statusCode?: number }).statusCode;
    console.warn('push rejected', status, new URL(sub.endpoint).host);
    if (typeof status === 'number') return status;
    throw err;
  }
}

async function prune(endpoints: string[]): Promise<void> {
  const { error } = await admin.rpc('push_prune_subscriptions', { p_endpoints: endpoints });
  if (error) console.error('prune failed', error.message);
}

Deno.serve(async (req) => {
  if (!sameSecret(req.headers.get('x-notify-secret') ?? '', env('NOTIFY_SECRET'))) {
    return new Response('unauthorized', { status: 401 });
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }
  if (!isNotifyRequest(body)) {
    return new Response('bad request', { status: 400 });
  }
  const result = await handleNotify(body, { send, prune });
  return Response.json(result);
});
