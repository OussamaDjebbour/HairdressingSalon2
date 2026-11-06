# Booking notifications — setup

When a client books on the site, the owner's phone shows a notification ("Nouvelle réservation: Nour · Samedi 7 novembre à 10:00 …"). Tapping it opens that booking in `/admin`. Bookings she adds herself don't notify her.

**How it works:**
1. An online booking is inserted.
2. A database trigger runs `private.post_push`.
3. That fires an **asynchronous** `pg_net` POST to the Edge Function `notify-booking`. Because it's async, the client's booking never waits for it and never fails because of it.
4. The function sends a Web Push (VAPID) to each subscribed device of the owner.
5. It also deletes subscriptions the push service reports as gone.

Code:
- `supabase/migrations/20261107120000_push_notifications.sql`
- `supabase/functions/notify-booking/`
- `supabase/functions/_shared/notify.ts` (message text)
- `public/sw.js`
- `src/lib/push.ts`
- `src/components/admin/NotificationsCard.tsx`

## Going live (one time)

Prerequisites:
- PR #5 and the notifications PR are merged.
- The site is deployed on Vercel over HTTPS. Push only works over HTTPS.

Run the commands from the repo root.

1. **Push the database change:**

   ```sh
   supabase db push --dry-run   # should list 20261107120000_push_notifications.sql
   supabase db push
   ```

2. **Create the keys.** Generate them once and keep them somewhere safe, like a password manager:

   ```sh
   npx --yes web-push@3.6.7 generate-vapid-keys --json   # VAPID public + private key
   openssl rand -hex 32                                   # NOTIFY_SECRET
   ```

3. **Give the function its secrets.** `VAPID_SUBJECT` is a contact the push services (Google, Apple) can reach, for example the salon's email:

   ```sh
   supabase secrets set \
     VAPID_PUBLIC_KEY=<public key> \
     VAPID_PRIVATE_KEY=<private key> \
     VAPID_SUBJECT=mailto:<contact email> \
     NOTIFY_SECRET=<NOTIFY_SECRET>
   ```

4. **Deploy the function:**

   ```sh
   supabase functions deploy notify-booking --no-verify-jwt
   ```

5. **Tell the database where to send.** In the Supabase dashboard → SQL Editor, run once:

   ```sql
   select vault.create_secret('https://wfuystygggbgjztrgqen.supabase.co/functions/v1/notify-booking', 'notify_booking_url');
   select vault.create_secret('<NOTIFY_SECRET>', 'notify_booking_secret');
   ```

   Until both secrets exist, nothing is sent and bookings work normally.

6. **Set up Vercel.** Add the env var `VITE_VAPID_PUBLIC_KEY=<public key>` to the project, then redeploy.

7. **On the owner's phone:**
   - Open `https://<site>/admin` and log in.
   - **iPhone (iOS 16.4 or later):** in Safari, tap Partager → « Sur l'écran d'accueil », then open Élégance from the new icon and log in there. The card on the schedule shows these steps too.
   - Tap **Activer** and allow notifications.
   - Tap **Envoyer un test**. A "Notifications activées" notification should arrive within a few seconds.

## Troubleshooting

- **What did the database send, and what came back?**

  ```sql
  select id, status_code, error_msg, left(content, 200) from net._http_response order by id desc limit 5;
  ```

  - `200 {"sent":1,…}`: delivered to the push service.
  - `401`: `NOTIFY_SECRET` and the Vault secret don't match.
  - No rows: the Vault secrets are missing, or no device is subscribed.
- **Function logs:** Supabase dashboard → Edge Functions → `notify-booking` → Logs.
- **Notifications blocked on the phone:** the card says so. Re-allow them in the browser or iOS settings for the site.
- **Card says "Activées" but nothing arrives:**
  - Check the device's own notification settings: on a Mac, System Settings → Notifications → Google Chrome, plus Focus / Do Not Disturb. When the OS blocks the browser, pushes can't be shown, and the browser may drop the subscription; the push service then answers 410 and it's deleted.
  - Fix the setting, then on the card tap **Désactiver** → **Activer** → **Envoyer un test**.
  - Opening `/admin` also re-saves a still-valid subscription automatically, so one the server deleted comes back by itself.
- **Find out whether a push reached the browser:** in Chrome, `chrome://gcm-internals` → Start Recording shows registrations and received messages.

## Rotating the secret

```sh
supabase secrets set NOTIFY_SECRET=<new secret>
```

```sql
select vault.update_secret((select id from vault.secrets where name = 'notify_booking_secret'), '<new secret>');
```

## Local development

1. Copy `supabase/functions/.env.example` to `supabase/functions/.env` (git-ignored) and fill it in. The VAPID keys come from the command above, and `NOTIFY_SECRET` can be any string.
2. Run `supabase functions serve --env-file supabase/functions/.env`. If a newly added function answers "Function not found", restart this command.
3. Check the function: `supabase/functions/notify-booking/smoke.sh`.
4. Point the local database at the function. From inside Docker it is reached via Kong:

   ```sql
   select vault.create_secret('http://kong:8000/functions/v1/notify-booking', 'notify_booking_url');
   select vault.create_secret('<NOTIFY_SECRET from .env>', 'notify_booking_secret');
   ```

5. Run the app with `VITE_VAPID_PUBLIC_KEY=<public key>` alongside the usual `VITE_SUPABASE_*` variables. Service workers and push work on `http://localhost`.
