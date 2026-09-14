// SaviorFuel service worker
//
// Job: make the app itself open offline, and cache static assets
// (fonts, background image, the TFJS/MobileNet food-photo model
// once it's been loaded) so repeat visits are fast and work with no
// connection.
//
// Deliberately does NOT cache food-search API calls (USDA, Open
// Food Facts, Kalori/techapi.my) — those should always hit the
// network live, or fail visibly so the app's own offline fallback
// (the savedFoods cache inside index.html) handles it. An HTTP-level
// cache silently replaying old search results would be indistinguishable
// from a real live answer, which is worse than just failing.
//
// Bump the version suffix on both cache names whenever this file's
// caching logic changes, so old cached entries get cleaned up on
// the next activate rather than lingering forever.

var SHELL_CACHE = 'saviorfuel-shell-v1';
var RUNTIME_CACHE = 'saviorfuel-runtime-v1';

// Only files confirmed to actually exist in the repo right now.
// manifest.json references icons/icon-*.png that don't exist yet —
// left out here on purpose, since cache.addAll() aborts the whole
// install if even one URL in the list 404s.
var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './images/bg-nutrition.webp'
];

var NEVER_CACHE_HOSTS = [
  'api.nal.usda.gov',
  'world.openfoodfacts.org',
  'api.techapi.my'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function(cache){ return cache.addAll(SHELL_FILES); })
      .then(function(){ return self.skipWaiting(); }) // new SW takes over without waiting for all tabs to close
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys()
      .then(function(keys){
        return Promise.all(
          keys
            .filter(function(k){ return k !== SHELL_CACHE && k !== RUNTIME_CACHE; })
            .map(function(k){ return caches.delete(k); })
        );
      })
      .then(function(){ return self.clients.claim(); }) // start controlling already-open tabs immediately
  );
});

self.addEventListener('fetch', function(event){
  if (event.request.method !== 'GET') return; // never intercept POST/etc — irrelevant here anyway, but safe

  var url = new URL(event.request.url);
  if (NEVER_CACHE_HOSTS.indexOf(url.hostname) !== -1) return; // straight to network, untouched

  // The app document itself: network-first, so an online visit
  // always gets the latest push, falling back to the cached shell
  // only when there's no connection at all.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html')){
    event.respondWith(
      fetch(event.request)
        .then(function(res){
          var copy = res.clone();
          caches.open(SHELL_CACHE).then(function(cache){ cache.put(event.request, copy); });
          return res;
        })
        .catch(function(){
          return caches.match(event.request).then(function(cached){
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  // Everything else (same-origin static files, Google Fonts, the
  // TFJS/MobileNet CDN scripts and model weight files once they've
  // been fetched at least once) — cache-first, filling the cache
  // opportunistically the first time each one's actually used.
  event.respondWith(
    caches.match(event.request).then(function(cached){
      if (cached) return cached;
      return fetch(event.request).then(function(res){
        // Cross-origin resources loaded via <script>/<link> tags come
        // back as opaque (status 0) rather than 200 — still cache
        // those, just without being able to inspect them.
        if (res && (res.status === 200 || res.type === 'opaque')){
          var copy = res.clone();
          caches.open(RUNTIME_CACHE).then(function(cache){ cache.put(event.request, copy); });
        }
        return res;
      });
      // No .catch() here on purpose — with nothing cached and no
      // network, let the request fail naturally so the calling code
      // (an <img onerror>, a failed CDN script load, etc.) handles
      // it the way it already does today.
    })
  );
});
