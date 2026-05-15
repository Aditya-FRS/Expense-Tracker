const CACHE = 'expense-tracker-v1';
const OFFLINE_URL = '/';

const PRECACHE = [
  '/',
  '/css/styles.css',
  '/js/firebase-config.js',
  '/js/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// Install: pre-cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(PRECACHE.map(url => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Firebase API calls: network-only (auth + Firestore)
// - /api/firebase-config: network-first, fallback to stale
// - Static assets: cache-first
// - Navigation: network-first, fallback to cached /
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin Firebase SDK calls
  if (request.method !== 'GET') return;
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseapp.com') ||
      url.hostname.includes('firebase.googleapis')) return;

  // /api/firebase-config — network first, fall back to cache
  if (url.pathname === '/api/firebase-config') {
    e.respondWith(
      fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Navigation requests — network first, fall back to app shell
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Static assets — cache first, then network
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return res;
      });
    })
  );
});

// Background sync placeholder (for future offline queue support)
self.addEventListener('sync', e => {
  if (e.tag === 'sync-expenses') {
    // Could flush queued offline expenses here
    console.log('[SW] Background sync triggered');
  }
});

// Push notifications placeholder
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Expense Tracker', {
      body: data.body || '',
      icon: '/manifest.json',
      badge: '/manifest.json',
      tag: 'expense-tracker',
      renotify: true,
    })
  );
});
