'use strict';
/* StudioBindahh service worker — keeps the whole app available offline.
   App files: network first (so updates arrive), revalidated with ETags (a tiny 304 when nothing
   changed), and the cached copy is used when the network is down or too slow — so the app still
   opens instantly on weak on-set Wi-Fi.
   Fonts and the PDF reader (other origins): cached after first use.
   Live-collaboration traffic (/api/) is never touched. */
const VERSION = 'sb-v49';
const APP = VERSION + '-app', EXTRA = VERSION + '-extra';
const NET_TIMEOUT = 3500;   // ms to wait for the network before falling back to the cache

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(APP);
    try {
      const html = await (await fetch('index.html', { cache: 'no-cache' })).text();
      const urls = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
      for (const m of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) urls.push(m[1]);
      await Promise.all([...new Set(urls)].map(u => cache.add(new Request(u, { cache: 'no-cache' })).catch(() => { })));
    } catch (err) { /* offline during install: the first online visit fills the cache */ }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (err) { } }
    await self.clients.claim();
  })());
});

async function appFile(e) {
  const req = e.request, cache = await caches.open(APP);
  const fromNet = (async () => {
    const res = (req.mode === 'navigate' && await e.preloadResponse) || await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone()).catch(() => { });
    return res;
  })();
  const fallback = async () => (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('index.html') : undefined);
  /* whichever comes first: the network, or the cache once the network has taken too long */
  const slow = new Promise(res => setTimeout(async () => res(await fallback()), NET_TIMEOUT));
  try {
    const res = await Promise.race([fromNet, slow.then(r => r || fromNet)]);
    e.waitUntil(fromNet.catch(() => { }));   // let a late response still refresh the cache
    return res;
  } catch (err) {
    const hit = await fallback(); if (hit) return hit; throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    e.respondWith(appFile(e));
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
