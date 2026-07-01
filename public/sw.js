// CACHE_NAME version - easy to update for every release
const CACHE_NAME = 'rathayatra-v1.0.0';

// Core assets to pre-cache on install
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/icon.svg',
];

// 1. Install Event: Cache core assets and optionally skip waiting for first-time setup
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching core assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  
  // Call self.skipWaiting() to force the installing service worker to become active immediately
  // if this is the initial load (no active controller). For updates, we let the user click "Update Now"
  // to trigger it via message.
  if (!self.registration.active) {
    self.skipWaiting();
  }
});

// 2. Activate Event: Claim clients immediately and clean up old cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // Delete all caches except the current versioned cache name
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  
  // Claim clients immediately so the service worker controls the page without reload
  self.clients.claim();
});

// 3. Message Listener: Handle skipWaiting manual trigger from the UI update banner
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Received SKIP_WAITING signal, activating new version.');
    self.skipWaiting();
  }
});

// 4. Fetch Event: Implement caching strategies based on request type
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Avoid caching third-party API calls (e.g., Supabase DB, auth, external CDN)
  if (url.origin !== self.location.origin) return;

  // Bypass Next.js hot module reloading & webpack dev server files in development
  if (url.pathname.startsWith('/_next/webpack-hmr') || url.pathname.includes('hot-update')) return;

  // Bypass API routes completely - never cache API requests
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // --- STRATEGY 1: Network First for Navigation Requests (HTML / Page Routes) ---
  // This ensures users always get the latest layout and Next.js app pages from the server,
  // falling back to cache if offline. HTML files are never cached permanently.
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If response is valid, cache it for offline fallback and return it
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: try to serve the requested page from cache, or default to home '/'
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/');
          });
        })
    );
    return;
  }

  // --- STRATEGY 2: Stale While Revalidate for Static Assets (CSS, JS, Fonts) ---
  const isStaticAsset = 
    url.pathname.includes('/_next/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ttf');

  if (isStaticAsset) {
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
          // Silently swallow fetch errors for static assets if we are offline
        });

        // Return the cached asset immediately (stale), while update runs in background (revalidate)
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // --- STRATEGY 3: Cache First for Images ---
  const isImage = 
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.gif') ||
    url.pathname.endsWith('.ico') ||
    event.request.headers.get('accept')?.includes('image/');

  if (isImage) {
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
        });
      })
    );
    return;
  }

  // --- DEFAULT STRATEGY: Network-Only for all other GET requests ---
  event.respondWith(fetch(event.request));
});
