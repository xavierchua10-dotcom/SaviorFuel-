// SaviorFuel — Copyright (c) 2026 Xavier Chua (Savior). All rights reserved. See LICENSE.
// SaviorFuel service worker
//
// Job: make the app itself open offline, and cache static assets
// (fonts, background image, the TFJS/MobileNet food-photo model
// once it's been loaded) so repeat visits are fast and work with no
// connection.
//
// Deliberately does NOT cache food-search API calls (USDA, Open
// Food Facts, the SaviorFuel Worker) — those should always hit the
// network live, or fail visibly so the app's own offline fallback
// (the savedFoods cache inside index.html) handles it. An HTTP-level
// cache silently replaying old search results would be indistinguishable
// from a real live answer, which is worse than just failing.
//
// Bump the version suffix on both cache names whenever this file's
// caching logic changes, so old cached entries get cleaned up on
// the next activate rather than lingering forever.

var SHELL_CACHE = 'saviorfuel-shell-v112';
var RUNTIME_CACHE = 'saviorfuel-runtime-v1';

// Required: cache.addAll() aborts the whole install if even one URL in
// this list 404s, so only files that certainly exist go here.
var SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './images/logo-mark.png',
  './images/logo-mark-light.png',
  './privacy.html',
  './data/foods/malaysian-dishes.txt',
  './data/foods/rice-noodles-breakfast.txt',
  './data/foods/kuih-desserts-drinks.txt',
  './data/foods/western-staples.txt',
  './data/foods/fruit-veg-asian-more.txt',
  './data/foods/malaysian-part1-malay.txt',
  './data/foods/malaysian-part2-chinese-kopitiam.txt',
  './data/foods/malaysian-part3-indian-mamak.txt',
  './data/foods/malaysian-part4-nyonya-east-malaysia.txt',
  './data/foods/malaysian-part5-drinks-fruit-staples.txt',
  './data/foods/nutrition-part1-chains.txt',
  './data/foods/nutrition-part2-packaged-brands.txt',
  './data/foods/nutrition-part3-sg-th-id-ph-bn.txt',
  './data/foods/nutrition-part4-japan-korea-vn-china.txt',
  './data/foods/nutrition-part5-western-mideast-indian.txt',
  './data/foods/nutrition-part6-raw-ingredients.txt',
  './data/foods/nutrition-part7-snacks-bakery-fitness.txt',
  './data/foods/nutrition2-part1-indonesian.txt',
  './data/foods/nutrition2-part2-indo-brands-malaysian-regional.txt',
  './data/foods/nutrition2-part3-convenience-hk-taiwan.txt',
  './data/foods/nutrition2-part4-thai-vn-khmer-lao-burmese.txt',
  './data/foods/nutrition3-part1-south-asian.txt',
  './data/foods/nutrition3-part2-european-american-latin.txt',
  './data/foods/nutrition3-part3-produce-meat-seafood.txt',
  './data/foods/nutrition3-part4-healthy-special-diet.txt',
  './data/foods/nutrition3-part5-dessert-cafe-bakery.txt',
  './data/icons/bak-kut-teh.webp',
  './data/icons/cendol.webp',
  './data/icons/char-kuey-teow.webp',
  './data/icons/chicken-rice.webp',
  './data/icons/kaya-toast.webp',
  './data/icons/kopi-o.webp',
  './data/icons/laksa.webp',
  './data/icons/mee-goreng.webp',
  './data/icons/nasi-goreng.webp',
  './data/icons/nasi-kandar.webp',
  './data/icons/nasi-lemak.webp',
  './data/icons/rendang.webp',
  './data/icons/roti-canai.webp',
  './data/icons/satay.webp',
  './data/icons/teh-tarik.webp',
  './data/icons/wantan-mee.webp'
];
// Nice-to-have (big 3D models for the Insights tab): fetched after install,
// one by one, and a failure here never blocks the install.
var EXTRA_FILES = [
  './models/food-pyramid-v2.glb'
];

var NEVER_CACHE_HOSTS = [
  'api.nal.usda.gov',
  'world.openfoodfacts.org',
  'saviorfuel-ai.xavierchua10.workers.dev',
  // Firebase accounts + sync must always go live to the network
  'firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebaseinstallations.googleapis.com', 'apis.google.com', 'accounts.google.com',   // food search and AI scan go through this Worker
  // Product thumbnails shown in food search. Left to the browser's own
  // HTTP cache instead of this file's cache-first store, which would
  // otherwise keep every thumbnail ever searched, forever.
  'images.openfoodfacts.org',
  'static.openfoodfacts.org'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function(cache){
        return cache.addAll(SHELL_FILES).then(function(){
          // not awaited by the install itself — keeps first install fast
          EXTRA_FILES.forEach(function(u){ cache.add(u).catch(function(){}); });
        });
      })
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

  // The app document and its stylesheet: network-first, so an online visit
  // always gets the latest push, falling back to the cached shell
  // only when there's no connection at all.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/style.css')){
    event.respondWith(
      // cache:'no-cache' makes the browser ask GitHub Pages "is this still
      // the latest?" every time, instead of reusing a copy it was told to
      // keep for ~10 minutes. That is what made new pushes need reloads.
      fetch(event.request, { cache: 'no-cache' })
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
