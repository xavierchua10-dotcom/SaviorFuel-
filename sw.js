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

var SHELL_CACHE = 'saviorfuel-shell-v140';
var RUNTIME_CACHE = 'saviorfuel-runtime-v1';

// Required: cache.addAll() aborts the whole install if even one URL in
// this list 404s, so only files that certainly exist go here.
var SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './js/app/01-state-helpers.js?v=140',
  './js/app/02-hero-ring.js?v=140',
  './js/app/03-log-view.js?v=140',
  './js/app/04-add-meal-overlay.js?v=140',
  './js/app/04b-panels.js?v=140',
  './js/app/05-food-sources.js?v=140',
  './js/app/06-my-foods-water.js?v=140',
  './js/app/07-food-search.js?v=140',
  './js/app/08-scanner.js?v=140',
  './js/app/09-ai-scan.js?v=140',
  './js/app/10-meal-actions.js?v=140',
  './js/app/11-history.js?v=140',
  './js/app/12-insights.js?v=140',
  './js/app/13-overview-goals.js?v=140',
  './js/app/14-profile-settings.js?v=140',
  './js/app/15-render-nav.js?v=140',
  './js/app/16-install-welcome-gate.js?v=140',
  './js/app/17-sync.js?v=140',
  './js/app/18-signin-welcome.js?v=140',
  './js/app/19-back-init.js?v=140',
  './js/app/20-tap-feedback.js?v=140',
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
  './data/icons/wantan-mee.webp',
  './data/icons/ais-kacang.webp',
  './data/icons/ang-ku-kuih.webp',
  './data/icons/apam-balik.webp',
  './data/icons/bubur-cha-cha.webp',
  './data/icons/dodol.webp',
  './data/icons/kuih-bahulu.webp',
  './data/icons/kuih-keria.webp',
  './data/icons/kuih-lapis.webp',
  './data/icons/kuih-talam.webp',
  './data/icons/mango-sticky-rice.webp',
  './data/icons/onde-onde.webp',
  './data/icons/pisang-goreng.webp',
  './data/icons/pulut-hitam.webp',
  './data/icons/pulut-inti.webp',
  './data/icons/seri-muka.webp',
  './data/icons/tau-fu-fah.webp',
  './data/icons/asam-laksa.webp',
  './data/icons/bihun-goreng.webp',
  './data/icons/curry-fish-head.webp',
  './data/icons/hokkien-mee.webp',
  './data/icons/mee-rebus.webp',
  './data/icons/mee-siam.webp',
  './data/icons/pan-mee.webp',
  './data/icons/pho.webp',
  './data/icons/prawn-mee.webp',
  './data/icons/ramen.webp',
  './data/icons/soto-ayam.webp',
  './data/icons/sup-ayam.webp',
  './data/icons/sup-tulang.webp',
  './data/icons/tom-yum.webp',
  './data/icons/wonton-soup.webp',
  './data/icons/yong-tau-foo.webp',
  './data/icons/ayam-goreng.webp',
  './data/icons/ayam-masak-merah.webp',
  './data/icons/ayam-percik.webp',
  './data/icons/beef-steak.webp',
  './data/icons/butter-prawns.webp',
  './data/icons/chicken-curry.webp',
  './data/icons/chilli-crab.webp',
  './data/icons/gulai-kambing.webp',
  './data/icons/ikan-bakar.webp',
  './data/icons/kangkung-belacan.webp',
  './data/icons/roast-chicken.webp',
  './data/icons/sambal-sotong.webp',
  './data/icons/steamed-fish.webp',
  './data/icons/telur-dadar.webp',
  './data/icons/tempeh-tauhu.webp',
  './data/icons/asam-pedas.webp',
  './data/icons/bubble-tea.webp',
  './data/icons/chrysanthemum-tea.webp',
  './data/icons/cola.webp',
  './data/icons/fresh-coconut.webp',
  './data/icons/fresh-milk.webp',
  './data/icons/iced-latte.webp',
  './data/icons/iced-lemon-tea.webp',
  './data/icons/iced-milo.webp',
  './data/icons/isotonic-drink.webp',
  './data/icons/mango-smoothie.webp',
  './data/icons/mineral-water.webp',
  './data/icons/orange-juice.webp',
  './data/icons/sirap-bandung.webp',
  './data/icons/soy-milk.webp',
  './data/icons/sugarcane-juice.webp',
  './data/icons/watermelon-juice.webp',
  './data/icons/curry-puff.webp',
  './data/icons/popiah.webp',
  './data/icons/spring-rolls.webp',
  './data/icons/keropok-lekor.webp',
  './data/icons/prawn-crackers.webp',
  './data/icons/pau.webp',
  './data/icons/roti-john.webp',
  './data/icons/murtabak.webp',
  './data/icons/thosai.webp',
  './data/icons/naan-chapati.webp',
  './data/icons/samosa.webp',
  './data/icons/vadai.webp',
  './data/icons/egg-tarts.webp',
  './data/icons/pineapple-tarts.webp',
  './data/icons/potato-chips.webp',
  './data/icons/corn-on-the-cob.webp',
  './data/icons/burger.webp',
  './data/icons/pizza.webp',
  './data/icons/spaghetti.webp',
  './data/icons/carbonara.webp',
  './data/icons/sandwich.webp',
  './data/icons/salad.webp',
  './data/icons/french-fries.webp',
  './data/icons/fried-chicken.webp',
  './data/icons/hot-dog.webp',
  './data/icons/chicken-nuggets.webp',
  './data/icons/pancakes.webp',
  './data/icons/waffle.webp',
  './data/icons/oatmeal.webp',
  './data/icons/cereal.webp',
  './data/icons/eggs-bacon.webp',
  './data/icons/fish-and-chips.webp',
  './data/icons/gado-gado.webp',
  './data/icons/nasi-padang.webp',
  './data/icons/pad-thai.webp',
  './data/icons/green-curry.webp',
  './data/icons/bakso.webp',
  './data/icons/mie-ayam.webp',
  './data/icons/nasi-uduk.webp',
  './data/icons/ayam-bakar.webp',
  './data/icons/pecel.webp',
  './data/icons/som-tam.webp',
  './data/icons/tom-kha.webp',
  './data/icons/khao-pad.webp',
  './data/icons/pad-kra-pao.webp',
  './data/icons/larb.webp',
  './data/icons/banana.webp',
  './data/icons/apple.webp',
  './data/icons/orange.webp',
  './data/icons/mango.webp',
  './data/icons/durian.webp',
  './data/icons/papaya.webp',
  './data/icons/watermelon.webp',
  './data/icons/pineapple.webp',
  './data/icons/grapes.webp',
  './data/icons/strawberry.webp',
  './data/icons/rambutan.webp',
  './data/icons/dragon-fruit.webp',
  './data/icons/mangosteen.webp',
  './data/icons/guava.webp',
  './data/icons/jackfruit.webp',
  './data/icons/avocado.webp',
  './data/icons/white-rice.webp',
  './data/icons/boiled-eggs.webp',
  './data/icons/bread.webp',
  './data/icons/cheese.webp',
  './data/icons/tofu.webp',
  './data/icons/potato.webp',
  './data/icons/sweet-potato.webp',
  './data/icons/tomato.webp',
  './data/icons/carrot.webp',
  './data/icons/broccoli.webp',
  './data/icons/mushroom.webp',
  './data/icons/cabbage.webp',
  './data/icons/cucumber.webp',
  './data/icons/eggplant.webp',
  './data/icons/chilli.webp',
  './data/icons/peanuts.webp',
  './data/icons/chicken-breast.webp',
  './data/icons/whole-chicken.webp',
  './data/icons/raw-steak.webp',
  './data/icons/minced-meat.webp',
  './data/icons/lamb-chops.webp',
  './data/icons/pork-belly.webp',
  './data/icons/sausages.webp',
  './data/icons/bacon.webp',
  './data/icons/salmon-fillet.webp',
  './data/icons/whole-fish.webp',
  './data/icons/prawns.webp',
  './data/icons/squid.webp',
  './data/icons/crab.webp',
  './data/icons/clams.webp',
  './data/icons/canned-fish.webp',
  './data/icons/fish-balls.webp',
  './data/icons/briyani.webp',
  './data/icons/cake-slice.webp',
  './data/icons/chocolate-bar.webp',
  './data/icons/congee.webp',
  './data/icons/cookies.webp',
  './data/icons/croissant.webp',
  './data/icons/cupcake.webp',
  './data/icons/donut.webp',
  './data/icons/ice-cream.webp',
  './data/icons/kebab-wrap.webp',
  './data/icons/mochi.webp',
  './data/icons/muffin.webp',
  './data/icons/protein-bar.webp',
  './data/icons/protein-shake.webp',
  './data/icons/sushi.webp',
  './data/icons/yoghurt.webp',
  './data/icons/beef-stew.webp',
  './data/icons/clear-soup.webp',
  './data/icons/fried-rice.webp',
  './data/icons/grilled-fish.webp',
  './data/icons/jam-jar.webp',
  './data/icons/mixed-nuts.webp',
  './data/icons/noodle-soup.webp',
  './data/icons/peanut-butter.webp',
  './data/icons/sambal-jar.webp',
  './data/icons/scrambled-eggs.webp',
  './data/icons/snack-bag.webp',
  './data/icons/soy-sauce.webp',
  './data/icons/stir-fry-chicken.webp',
  './data/icons/stir-fry-veg.webp',
  './data/icons/toast-egg.webp',
  './data/icons/yellow-curry.webp',
  './data/icons/soft-drink-can.webp',
  './data/icons/milk-carton.webp',
  './data/icons/dumplings.webp',
  './data/icons/kuih-tray.webp',
  './data/icons/pudding.webp',
  './data/icons/nasi-campur.webp',
  './data/icons/fried-noodles.webp',
  './data/icons/fruit-salad.webp',
  './data/icons/beer.webp',
  './data/icons/cup-noodles.webp'
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
