// Service worker for the salon admin: shows booking notifications and opens the booking on tap.
// No fetch handler on purpose: this is not an offline app.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  const title = message.title || 'Élégance';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: message.body || '',
      tag: message.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: message.url || '/admin' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const admin = windows.find((w) => new URL(w.url, self.location.origin).pathname.startsWith('/admin'));
      if (admin) {
        return admin.focus().then((w) => (w || admin).navigate(url));
      }
      return self.clients.openWindow(url);
    })
  );
});
