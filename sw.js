const CACHE = 'flh-v1';

const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Mulish:wght@400;500;600;700;800&family=Poppins:wght@600;700;800&display=swap'
];

// Installatie: sla de kern-bestanden op in cache
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activatie: verwijder oude caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first voor statische bestanden, network-first voor API calls
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls (Make, Supabase, Anthropic) altijd via netwerk
  if (
    url.hostname.includes('make.com') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('tally.so') ||
    url.pathname.startsWith('/api/')
  ) {
    return; // laat de browser het normaal afhandelen
  }

  // Statische bestanden: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Sla succesvolle responses op in cache
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: stuur de gecachte homepage terug
        if (e.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
