// Service Worker for Web Push notifications.
// Receives push events and displays them as browser notifications.
// On notification click, opens or focuses the relevant ticket page.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'お知らせ', body: event.data.text() };
  }

  const title = payload.title || 'お知らせ';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: payload.url || '/' },
    requireInteraction: false,
  };

  // Broadcast to all open windows so tests (and live UI) can react immediately.
  const broadcast = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windowClients) => {
      for (const client of windowClients) {
        client.postMessage({ type: 'PUSH_RECEIVED', title, body: options.body, url: options.data.url });
      }
    });

  event.waitUntil(
    Promise.all([self.registration.showNotification(title, options), broadcast])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
