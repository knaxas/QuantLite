'use strict';

importScripts('js/config.js');

const ICON = 'icons/icon-192.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => event.waitUntil(showPending()));

async function showPending(){
  let messages = [];
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub && QL_CONFIG.proxyUrl) {
      const res = await fetch(QL_CONFIG.proxyUrl.replace(/\/+$/, '') + '/push/pending', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({endpoint: sub.endpoint})
      });
      messages = (await res.json()).messages || [];
    }
  } catch {}
  if (!messages.length) messages = [{title: 'QuantLite', body: 'Neue Kursbenachrichtigung', url: ''}];
  await Promise.all(messages.map((m, i) => self.registration.showNotification(m.title, {
    body: m.body,
    icon: ICON,
    badge: ICON,
    tag: 'ql-' + Date.now() + '-' + i,
    data: {url: m.url || ''}
  })));
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const w of windows) {
      if ('focus' in w) {
        await w.focus();
        if ('navigate' in w) return w.navigate(target);
        return;
      }
    }
    return self.clients.openWindow(target);
  })());
});
