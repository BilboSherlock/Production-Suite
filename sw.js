'use strict';
/* StudioBindahh service worker — keeps the whole app available offline.
   App files: network first (so updates arrive), cache as the fallback.
   Fonts and the PDF reader (other origins): cached after first use.
   Live-collaboration traffic (/api/) is never touched. */
const VERSION = 'sb-v5';
const APP = VERSION + '-app', EXTRA = VERSION + '-extra';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(APP);
    try {
      const html = await (await fetch('index.html', { cache: 'no-store' })).text();
      const urls = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
      for (const m of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) urls.push(m[1]);
      await Promise.all([...new Set(urls)].map(u => cache.add(new Request(u, { cache: 'no-store' })).catch(() => { })));
    } catch (err) { /* offline during install: the first online visit fills the cache */ }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => { for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k); await self.clients.claim(); })());
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    e.respondWith((async () => {
      const cache = await caches.open(APP);
      try { const res = await fetch(req, { cache: 'no-store' }); if (res.ok) cache.put(req, res.clone()); return res; }
      catch (err) { const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : null); if (hit) return hit; throw err; }
    })());
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host)) {
    e.respondWith((async () => {
      const cache = await caches.open(EXTRA), hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});
