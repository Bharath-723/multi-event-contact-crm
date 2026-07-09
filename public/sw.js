// ONLINE-FIRST Cache Versioning
const CACHE_NAME = 'rathayatra-online-v1783600184957';

// Core assets to pre-cache (excluding root '/' and HTML to force online-first layout checks)
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/icon.svg',
  '/hkm-logo.png',
];

// 1. Install Event: Cache only the static configuration files (NO HTML cached)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static config assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  
  // Skip waiting only on initial install (no active controller). 
  // For updates, the worker waits until the user clicks "Update Now".
  if (!self.registration.active) {
    self.skipWaiting();
  }
});

// 2. Activate Event: Claim control immediately and aggressively delete ALL old cache keys
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting obsolete cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  
  // Make sure new SW takes control of all pages immediately
  self.clients.claim();
});

// 3. Message Listener: Support skipWaiting manual activation signals
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skipping waiting state and activating immediately.');
    self.skipWaiting();
  }
});

// 4. Fetch Event: Implement Online-First Caching Strategy
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Avoid intercepting third-party API calls (e.g. Supabase, external APIs)
  if (url.origin !== self.location.origin) return;

  // Bypass webpack dev server HMR files
  if (url.pathname.startsWith('/_next/webpack-hmr') || url.pathname.includes('hot-update')) return;

  // --- API & Database Routes (Network Only) ---
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // --- HTML Pages & Navigation Requests (Network First - NEVER CACHED PERMANENTLY) ---
  // We do NOT write HTML responses to the cache. This ensures the browser always fetches
  // the freshest HTML from Vercel, preventing stale PWA layouts on Android.
  const isNavigation = event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html');
  if (isNavigation) {
    event.respondWith(
      fetch(event.request).catch((err) => {
        console.warn('[SW] Navigation fetch failed (offline). Checking fallback...', err);
        // If offline and we have a cached page, serve it. Otherwise, let it fail.
        return caches.match(event.request);
      })
    );
    return;
  }

  // --- Static Assets CSS & JS (Stale-While-Revalidate) ---
  const isStaticCode = 
    url.pathname.includes('/_next/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  if (isStaticCode) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Ignore offline errors for revalidation
        });

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // --- Images, Fonts & Icons (Cache First) ---
  const isImage = 
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.gif') ||
    url.pathname.endsWith('.ico') ||
    event.request.headers.get('accept')?.includes('image/');

  const isFont = 
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.otf');

  if (isImage || isFont) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // If offline and image is not in cache, let it fail
        });
      })
    );
    return;
  }

  // --- Default: Fetch from network ---
  event.respondWith(fetch(event.request));
});
