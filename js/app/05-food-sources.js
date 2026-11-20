  function searchFoodDebounced(query){
    clearTimeout(ui.searchDebounce);
    if (!query || query.trim().length < 2){
      if (searchAbort) searchAbort.abort(); // drop any search still in flight
      searchRequestId++;
      renderFoodHome();
      return;
    }
    // Foods you've saved before are local, so if nothing's on screen yet
    // show those on the very first keystroke rather than waiting out the
    // debounce; the online sources follow (see runFoodSearch).
    var resultsNow = document.getElementById('foodSearchResults');
    if (resultsNow && !resultsNow.querySelector('.food-suggest-item')){
      var savedNow = searchSavedFoods(query);
      if (savedNow.length > 0){
        foodSearch = { id: searchRequestId, query: query.trim(), products: savedNow, pending: 1, stale: false };
        renderFoodSearchResults();
      }
    }
    // Shorter debounce than you might expect for a network call — paired
    // with not blanking the list below, this is the closest a remote
    // search can feel to SaviorFit Logger's instant local exercise search.
    ui.searchDebounce = setTimeout(function(){ runFoodSearch(query.trim()); }, 180);
  }

  var searchRequestId = 0; // guards against a slow older request overwriting a newer one's results
  // Food lookups (USDA search and barcode) go through your own Cloudflare Worker,
  // which holds the key privately. No API keys live in this file.
  var FOODS_PROXY_URL = 'https://saviorfuel-ai.xavierchua10.workers.dev';

  // (Kalori search was removed — its key leaked. Foods saved from it earlier still show.)


  // Normalizes a USDA FoodData Central food into the same shape as an
  // Open Food Facts product, so the rest of the search/pick pipeline
  // (pickFoodResult, applySelectedFoodToForm) doesn't need to know or
  // care which source a result came from.
  function usdaToProductShape(food){
    var n = {};
    var atwaterKcal = null; // Foundation Foods often report energy only via Atwater factors
    (food.foodNutrients || []).forEach(function(fn){
      if (fn.unitName === 'KCAL' && /^Energy \(Atwater/.test(fn.nutrientName || '')){ if (atwaterKcal == null) atwaterKcal = fn.value; }
      else if (fn.nutrientName === 'Energy' && fn.unitName === 'KCAL') n['energy-kcal_100g'] = fn.value;
      else if (fn.nutrientName === 'Protein') n['proteins_100g'] = fn.value;
      else if (fn.nutrientName === 'Carbohydrate, by difference') n['carbohydrates_100g'] = fn.value;
      else if (fn.nutrientName === 'Total lipid (fat)') n['fat_100g'] = fn.value;
      else if (fn.nutrientName === 'Fiber, total dietary') n['fiber_100g'] = fn.value;
      else if (fn.nutrientName === 'Sugars, total including NLEA' || fn.nutrientName === 'Total Sugars' || fn.nutrientName === 'Sugars, Total') n['sugars_100g'] = fn.value;
      // USDA reports sodium in mg (unitName 'MG') already, unlike OFF
      // which reports it in g like the other nutrients — kept under
      // its own key so the mg-vs-g unit mismatch can't get mixed up
      // downstream (see pickFoodResult / onBarcodeDetected).
      else if (fn.nutrientName === 'Sodium, Na') n['sodium_100g_mg'] = fn.value;
    });
    if (n['energy-kcal_100g'] == null && atwaterKcal != null) n['energy-kcal_100g'] = atwaterKcal;
    // USDA's bulk/commodity entries carry long bureaucratic annotations
    // like "(Includes foods for USDA's Food Distribution Program)" —
    // meaningless noise for a personal food log, so strip any
    // parenthetical that mentions USDA rather than log it verbatim.
    var name = (food.description || '').replace(/\s*\([^)]*USDA[^)]*\)/gi, '').trim();
    // Household measures ("1 cup, chopped" = 160 g) when USDA includes
    // them, so the serving picker can offer cups etc. (not confirmed for
    // every item — foods without them just get grams / ounces).
    var measures = [];
    (food.foodMeasures || []).forEach(function(m){
      var g = Number(m.gramWeight);
      var text = String(m.disseminationText || '').replace(/\s+/g, ' ').trim();
      if (!(g > 0) || !text || /quantity not specified/i.test(text)) return;
      var label = text.replace(/^1\s+/, ''); // "1 cup" -> "cup" (the amount field supplies the number)
      if (!measures.some(function(x){ return x.label === label; })) measures.push({ label: label, grams: g });
    });
    return { product_name: name, brands: food.brandOwner || '', nutriments: n, _source: 'usda', _measures: measures.slice(0, 4) };
  }

  // Foundation + SR Legacy are USDA's generic/whole-food datasets —
  // exactly the "plain chicken breast," "egg" category Open Food Facts
  // is weakest at, since OFF mostly covers branded/packaged items.
  function fetchUSDA(query, signal){
    var url = FOODS_PROXY_URL + '/usda?q=' + encodeURIComponent(query);
    return fetch(url, { signal: signal })
      .then(function(res){ if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function(data){
        return (data.foods || [])
          .map(usdaToProductShape)
          .filter(function(p){ return p.product_name && p.nutriments['energy-kcal_100g'] != null; });
      });
  }

  // `fields` trims the response to what the app actually uses — Open Food
  // Facts products are huge (ingredients, images, dozens of tags), and
  // that payload is a big part of why this source is the slow one.
  function fetchOpenFoodFacts(query, signal){
    var url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' +
      encodeURIComponent(query) + '&search_simple=1&action=process&json=1&page_size=10' +
      '&fields=product_name,brands,nutriments,serving_quantity,serving_size,image_front_thumb_url,image_thumb_url,image_small_url';
    return fetch(url, { signal: signal })
      .then(function(res){ if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function(data){
        return (data.products || [])
          .map(function(p){
            p._source = 'off';
            p._image = p.image_front_thumb_url || p.image_thumb_url || p.image_small_url || '';
            return p;
          })
          .filter(function(p){ return p.product_name && p.nutriments && p.nutriments['energy-kcal_100g'] != null; });
      });
  }

  /* ---- Food search: fast and progressive ----
     Kalori, USDA and Open Food Facts are asked in parallel and their
     results appear as each one answers, instead of waiting for the
     slowest (Open Food Facts can take many seconds). Saved foods show
     instantly; an old search is cancelled as soon as you keep typing;
     each source gets a timeout; and a repeated query is answered from
     a short-lived memory cache. Results already on screen never move —
     later sources only add to the bottom — so a tap always lands on
     the row you aimed at. */
  var FOOD_SOURCE_TIMEOUT_MS = 7000;
  var FOOD_CACHE_TTL_MS = 10 * 60 * 1000;
  var foodSearchCache = {};   // 'source|query' -> { t, list }
  var searchAbort = null;
  var foodSearch = { id: 0, query: '', products: [], pending: 0, stale: false };

  function pruneFoodCache(){
    var keys = Object.keys(foodSearchCache);
    if (keys.length <= 80) return;
    keys.sort(function(a, b){ return foodSearchCache[a].t - foodSearchCache[b].t; });
    keys.slice(0, keys.length - 80).forEach(function(k){ delete foodSearchCache[k]; });
  }

  // One source, with cache + timeout + cancel. Never rejects: a source
  // that fails just contributes nothing (and isn't cached, so it gets
  // another chance next time).
  function searchFoodSource(name, query, fetcher, signal){
    var key = name + '|' + query.toLowerCase();
    var hit = foodSearchCache[key];
    if (hit && Date.now() - hit.t < FOOD_CACHE_TTL_MS) return Promise.resolve(hit.list);
    var ctrl = new AbortController();
    var onAbort = function(){ ctrl.abort(); };
    signal.addEventListener('abort', onAbort);
    var timer = setTimeout(function(){ ctrl.abort(); }, FOOD_SOURCE_TIMEOUT_MS);
    var done = function(){ clearTimeout(timer); signal.removeEventListener('abort', onAbort); };
    return fetcher(query, ctrl.signal)
      .then(function(list){
        done();
        foodSearchCache[key] = { t: Date.now(), list: list };
        pruneFoodCache();
        return list;
      }, function(err){
        done();
        if (!(err && err.name === 'AbortError')) console.error('SaviorFuel: ' + name + ' search failed —', err);
        return [];
      });
  }

  /* ---- Pictures in search results ----
     Packaged products from Open Food Facts (and anything you saved from
     one, or a Kalori entry that includes one) show their photo. Nothing
     else has a photo source — USDA has none, and generic/local dishes
     like "chicken breast" or "nasi lemak" aren't packaged products — so
     every other row gets an emoji picked from the food's name (English
     and Malay words). If a photo fails to load (offline, dead link) the
     tile falls back to the emoji too. Emoji are limited to older, widely
     supported ones so they render on older phones. */
  var FOOD_EMOJI_RULES = [
    [/\b(pizza)\b/i, '\uD83C\uDF55'],
    [/\b(burger|hamburger|cheeseburger)\b/i, '\uD83C\uDF54'],
    [/\b(french fries|fries)\b/i, '\uD83C\uDF5F'],
    [/\b(hot ?dog|sausages?|sosej)\b/i, '\uD83C\uDF2D'],
    [/\b(sushi|sashimi)\b/i, '\uD83C\uDF63'],
    [/\b(satay|sate|kebab)\b/i, '\uD83C\uDF62'],
    [/\b(dumplings?|dim sum|gyoza|siomay)\b/i, '\uD83E\uDD5F'],
    [/\b(tacos?|burrito)\b/i, '\uD83C\uDF2E'],
    [/\b(pasta|spaghetti|macaroni|lasagn?a)\b/i, '\uD83C\uDF5D'],
    [/\b(noodles?|mee|mi|mie|mihun|bihun|kuey teow|kway teow|laksa|ramen|udon|pho|vermicelli|maggi)\b/i, '\uD83C\uDF5C'],
    [/\b(curry|kari|rendang|gulai)\b/i, '\uD83C\uDF5B'],
    [/\b(soups?|sup|soto|stew|broth|bak kut teh)\b/i, '\uD83C\uDF72'],
    [/\b(nasi|rice|bubur|porridge|congee|biryani|briyani|risotto)\b/i, '\uD83C\uDF5A'],
    [/\b(chicken|ayam|poultry|drumsticks?|wings?|nuggets?)\b/i, '\uD83C\uDF57'],
    [/\b(eggs?|telur|omelette|omelet)\b/i, '\uD83E\uDD5A'],
    [/\b(prawns?|shrimps?|udang)\b/i, '\uD83E\uDD90'],
    [/\b(squid|sotong|cuttlefish|octopus)\b/i, '\uD83E\uDD91'],
    [/\b(crabs?|ketam)\b/i, '\uD83E\uDD80'],
    [/\b(fish|ikan|salmon|tuna|sardines?|mackerel|tilapia|cod|anchov\w*|seafood)\b/i, '\uD83D\uDC1F'],
    [/\b(beef|daging|steak|lamb|mutton|kambing|pork|bacon|ham|ribs?|meatballs?|veal|liver)\b/i, '\uD83E\uDD69'],
    [/\b(pancakes?|waffles?|crepes?|apam)\b/i, '\uD83E\uDD5E'],
    [/\b(bread|roti|toast|buns?|loaf|bagel|croissant|baguette|pau)\b/i, '\uD83C\uDF5E'],
    [/\b(ice cream|aiskrim|gelato)\b/i, '\uD83C\uDF68'],
    [/\b(cake|kek|cupcakes?|muffins?|brownie)\b/i, '\uD83C\uDF70'],
    [/\b(chocolate|coklat|cocoa)\b/i, '\uD83C\uDF6B'],
    [/\b(cookies?|biscuits?|crackers?|wafers?)\b/i, '\uD83C\uDF6A'],
    [/\b(donuts?|doughnuts?)\b/i, '\uD83C\uDF69'],
    [/\b(candy|candies|sweets|gummy|lollipop)\b/i, '\uD83C\uDF6C'],
    [/\b(cendol|ais kacang|shaved ice)\b/i, '\uD83C\uDF67'],
    [/\b(kuih|kueh|pudding)\b/i, '\uD83C\uDF61'],
    [/\b(cheese|keju)\b/i, '\uD83E\uDDC0'],
    [/\b(milk|susu|yogh?urt|dairy|cream|creamer)\b/i, '\uD83E\uDD5B'],
    [/\b(coffee|kopi|latte|cappuccino|espresso|tea|teh)\b/i, '\u2615'],
    [/\b(juice|jus|smoothie|soda|cola|coke|pepsi|sprite|fanta|soft drink|energy drink|isotonic|100 ?plus|milo)\b/i, '\uD83E\uDD64'],
    [/\b(water|mineral)\b/i, '\uD83D\uDCA7'],
    [/\b(apples?|epal)\b/i, '\uD83C\uDF4E'],
    [/\b(bananas?|pisang)\b/i, '\uD83C\uDF4C'],
    [/\b(oranges?|oren|mandarin|limau)\b/i, '\uD83C\uDF4A'],
    [/\b(lemons?)\b/i, '\uD83C\uDF4B'],
    [/\b(mango|mangoes|mangga)\b/i, '\uD83E\uDD6D'],
    [/\b(grapes?|anggur)\b/i, '\uD83C\uDF47'],
    [/\b(watermelon|tembikai)\b/i, '\uD83C\uDF49'],
    [/\b(pineapple|nanas)\b/i, '\uD83C\uDF4D'],
    [/\b(strawberr(?:y|ies))\b/i, '\uD83C\uDF53'],
    [/\b(coconut|kelapa)\b/i, '\uD83E\uDD65'],
    [/\b(avocados?|alpukat)\b/i, '\uD83E\uDD51'],
    [/\b(fruits?|buah|papaya|durian|rambutan|guava|jambu|berr(?:y|ies)|peach|pears?|cherr(?:y|ies)|kiwi|melon)\b/i, '\uD83C\uDF4E'],
    [/\b(carrots?|lobak)\b/i, '\uD83E\uDD55'],
    [/\b(broccoli)\b/i, '\uD83E\uDD66'],
    [/\b(tomato(?:es)?)\b/i, '\uD83C\uDF45'],
    [/\b(potato(?:es)?|kentang)\b/i, '\uD83E\uDD54'],
    [/\b(corn|jagung)\b/i, '\uD83C\uDF3D'],
    [/\b(cucumbers?|timun)\b/i, '\uD83E\uDD52'],
    [/\b(mushrooms?|cendawan)\b/i, '\uD83C\uDF44'],
    [/\b(eggplants?|aubergine|terung)\b/i, '\uD83C\uDF46'],
    [/\b(chill?i(?:es)?|cili)\b/i, '\uD83C\uDF36\uFE0F'],
    [/\b(salad|lettuce|spinach|bayam|kangkung|sayur|vegetables?|cabbage|kubis|sawi|kale|greens)\b/i, '\uD83E\uDD57'],
    [/\b(nuts?|peanuts?|kacang|almonds?|cashews?|walnuts?)\b/i, '\uD83E\uDD5C'],
    [/\b(tofu|tauhu|tempeh|tempe|beans?|lentils?|dal|soy|soya)\b/i, '\uD83C\uDF31'],
    [/\b(cereal|oats?|oatmeal|granola|muesli|nestum)\b/i, '\uD83E\uDD63'],
    [/\b(popcorn|crisps|keropok|snacks?)\b/i, '\uD83C\uDF7F'],
    [/\b(honey|madu)\b/i, '\uD83C\uDF6F'],
    [/\b(sauce|sos|ketchup|sambal|kicap|mayonnaise|dressing|paste|jam)\b/i, '\uD83E\uDD6B']
  ];
  // Hand-drawn dish icons (data/icons/NAME.webp). Checked before the emoji
  // list, so a dish with its own icon shows that; everything else keeps its
  // emoji. More are added as sheets are drawn. Specific names go first.
  var FOOD_ICON_RULES = [
  // sheet 16 (western, Indian, snacks & supplements)
  [/^ondeh[- ]?ondeh/i, 'onde-onde'],
  [/\btakoyaki\b/i, 'takoyaki'],
  [/^(tong sui|bubur kacang (merah|hijau))/i, 'tong-sui'],
  [/^(?!.*\b(steamed|stim)\b)(.*\b(fried (carrot|radish) cake|chai tow kway|char koay kak|lobak goreng|singapore carrot cake)\b)/i, 'fried-carrot-cake'],
  [/^(adana kebab|lamb adana kebab|beef kofta kebab|seekh kebab)/i, 'adana-kebab'],
  [/\bpretzels?\b/i, 'pretzel'],
  [/\bmacarons?\b/i, 'macarons'],
  [/\b(french toast|sai do si)\b/i, 'french-toast'],
  [/^(palak|saag) paneer/i, 'palak-paneer'],
  [/^(payasam|kheer)\b/i, 'payasam'],
  [/^ratatouille/i, 'ratatouille'],
  [/^(?!.*\b(zucchini|courgette)\b)(.*\b(pastitsio|lasagn?a|moussaka)\b)/i, 'baked-pasta'],
  [/^gnocchi/i, 'gnocchi'],
  [/^pork adobo/i, 'pork-adobo'],
  [/^(ham and cheese crepe|savory galette|sweet crepe|nutella banana crepe)/i, 'crepe'],
  [/^(?!.*\b(shake|smoothie|oat|oatmeal|overnight|pancakes?|bowl|mixed with|drink|milk|mug cake|balls|toast|bar)\b)(.*\b(whey|casein|gainer|protein powder|creatine|pre-workout|bcaa|amino energy|meal replacement shake)\b)/i, 'protein-powder'],
  // sheet 15 (kuih, bakery & misc): these beat the older tray/pau/cookies/coconut rules
  [/\broti jala\b/i, 'roti-jala'],
  [/^(?!tau sar)[^(]*\b(mooncake|kuih bulan)\b/i, 'mooncake'],
  [/^(nian gao|kuih bakul(?! goreng))/i, 'nian-gao'],
  [/^(polo bun|pang susie|roti ban kaya|gardenia (squiggles|quickbites)[^(]*\([^)]*\bbun\b|massimo duetto[^(]*\([^)]*\bbun\b)/i, 'baked-bun'],
  [/^idli/i, 'idli'],
  [/^(chawanmushi|sushi king chawanmushi|steamed egg \()/i, 'steamed-egg'],
  [/^(egg tofu \(|salted egg tofu)/i, 'tofu-egg'],
  [/^(sambal telur(?! goreng)|telur masak sambal|hard-boiled eggs in chili|poached eggs in chili)/i, 'sambal-egg'],
  [/\b(ketayap|kuih dadar|dadar gulung)\b/i, 'ketayap'],
  [/^(puri|poori)\b(?!.*\bcrisp)/i, 'puri'],
  [/^(love letters?|kuih kapit|kuih belanda)\b/i, 'love-letters'],
  [/\b(swiss roll|bolu meranti gulung|london choco roll|kek gulung)\b/i, 'swiss-roll'],
  [/^(?!buko pandan)[^(]*\b(air kelapa|coconut water|kelapa muda)\b/i, 'coconut-water'],
  [/^(?!roti)[^(]*\bgarlic bread\b/i, 'garlic-bread'],
  [/^(?=.*\b(ais|iced|ice)\b)(?=.*\b(malt|chocolate|milo|neslo|ovaltine|horlicks)\b)(?!.*\b(cream|cake|tea|donut|doughnut|glazed|krispy|mocha|espresso|latte|zus)\b)/i, 'iced-milo'],
  // sheet 12 top rules (must beat older ones)
  [/^(?!.*\b(onigiri|bento|don|udon|chawanmushi|edamame|takoyaki|miso|tempura|bowl|salad|chirashi|poke)\b)(?=.*\b(sushi|nigiri|maki|sashimi|gunkan)\b)/i, 'sushi'],
  [/^(?!.*\b(kacang|bijan|keledek|keladi|barli|jagung|pulut hitam|cha cha|champorado|oat|polenta|upma|pongal|haleem|es pisang|tong sui|sweet potato|durian|tohu|sago)\b)(bubur|.*\bcongee\b|.*\bfish porridge\b|claypot frog porridge|arroz caldo|teochew porridge|.*\brice porridge\b)/i, 'congee'],
  [/^(?!.*\b(waffle|shake|float|soda|ais kacang|abc|affogato|falooda|sundae|pie|spread)\b)(ice cream|aiskrim|gelato|soft serve|kulfi|matcha (ice cream|soft serve)|nestle (drumstick|la cremeria)|famil\w* sofuto|es podeng|frozen yogh?urt)/i, 'ice-cream'],
  [/^(?!.*\bsponge\b.*\bkek\b)(.*\bcupcakes?\b|massimo chiffon|kek cawan|bolu kukus)/i, 'cupcake'],
  [/^(kuih|kue) bangkit|^pocky/i, 'cookies'],
  [/^matcha mille crepe cake/i, 'cake-slice'],
    // sheet 11 (meat & seafood): raw/plain ingredient names; these beat older rules
    [/^(?!.*\b(biryani|korma|curry|mandi|kebab|satay|varuval|perattal)\b)(lamb chops?|daging kambing mentah|kambing mentah|raw lamb)/i, 'lamb-chops'],
    [/^(?!.*\b(soup|curry|kari|masak|sambal|goreng|fried|head|bee hoon|noodles?|sauce|tempoyak|asam|canned|paste|balls?|cakes?|roe|teriyaki|sashimi|nigiri|sushi|crackers?|keropok|otak|tuna|sardin\w*)\b)(ikan (kembung|tenggiri|siakap|merah|tilapia|bawal|patin|kerapu|selar|keli|tongkol|cencaru|kerisi)|mackerel|snapper|tilapia|catfish|seabass|barramundi|pomfret|cod|grouper|sea bass)\b/i, 'whole-fish'],
    [/^(?!.*\b(puff|sandwich|salad|melt|mayo|mayonnaise|john|murtabak|thosai|tosai|onigiri|sushi|kimbap|spread|masak)\b)(canned (sardines?|tuna|mackerel)|sardines? in |sardin in |tuna (in |chunks|flakes)|(yeo's|rex|ayam brand|john west) (sardines|tuna)|mackerel \(canned|salmon \(canned)/i, 'canned-fish'],
    // sheet 10 (staples & veg): boiled egg beats the 'ayam' rules
    [/^(?!.*\b(sambal|chili|mayo|toast|brioche|sandwich|fried)\b)(hard.boiled eggs?|boiled eggs?|soft.boiled eggs?|telur (rebus|puyuh|pindang|ayam)|egg \((boiled|hard|whole|raw|large|medium))/i, 'boiled-eggs'],
    // sheet 8 (Indonesian & Thai): priority rules
    [/\b(gado[- ]?gado|lotek|karedok)\b/i, 'gado-gado'],
    [/^(?!.*\blele\b).*\b(nasi pecel|pecel|ketoprak|urap)\b/i, 'pecel'],
    [/\b(nasi padang|padang rice)\b/i, 'nasi-padang'],
    [/^(?!.*\bsauce\b).*\b(pad thai|phad thai|pad see ew|pad si ew|pad kee mao|drunken noodles)\b/i, 'pad-thai'],
    [/^(?!.*\b(paste|sauce|noodles?|mee|laksa|fish cakes?|tod mun|instant)\b).*\b(green curry|kari hijau|gaeng keow wan|gaeng kiew wan|red curry|gaeng daeng|massaman|panang)\b/i, 'green-curry'],
    [/^(?!.*\b(instant|cup noodles|pop mie|mie ayam)\b).*\b(bakso|baso)\b/i, 'bakso'],
    [/^(?!.*\b(soto|maggi|indomie|supermi|sarimi|instant|pop mie|khao swe)\b).*\b(mie ayam|mi ayam|bakmi ayam)\b/i, 'mie-ayam'],
    [/\b(nasi uduk|nasi timbel|nasi liwet|nasi kuning)\b/i, 'nasi-uduk'],
    [/^(?!.*\b(maggi|noodles?|mee|mie|burger)\b).*\bayam (bakar|taliwang)\b/i, 'ayam-bakar'],
    [/\b(som ?tam|som ?tum|tam mak hoong|papaya salad)\b/i, 'som-tam'],
    [/\b(tom kha|tom kah|tom khlong)\b/i, 'tom-kha'],
    [/^(?!.*\bsauce\b).*\b(khao pad|khao phat|thai fried rice|pineapple fried rice)\b/i, 'khao-pad'],
    [/\b(pad kra ?pao|pad gra ?pao|krapow|kra pao)\b/i, 'pad-kra-pao'],
    [/\b(larb|laab|larp|nam tok)\b/i, 'larb'],
    // sheet 6 (breads & snacks): priority rules that must beat older ones
    [/\bsamosas?\b(?!.*\b(thoke|chaat)\b)/i, 'samosa'],
    [/\b(roti john|omelette baguette)\b/i, 'roti-john'],
    [/^(?!.*\b(keping|rangup|crispy|crackers?)\b).*\b(lekor|leikor)\b|\bfish sausages?\b/i, 'keropok-lekor'],
    [/^(?!.*\b(cream crackers?|wheat crackers?|sugar crackers?|golden crackers?|calcium|malkist|weetameal|biscuits?|seblak|gado|soto|nasi|mee|noodles?|rice crackers?|senbei|snack|egg roll)\b).*\b(keropok|kerupuk|krupuk|prawn (crackers?|chips?)|shrimp (chips?|crackers?)|fish crackers?|emping|rempeyek|kemplang|melinjo)\b/i, 'prawn-crackers'],
    [/^(?!.*\b(fries|french fries|fish|noodles?|mee|nachos?|guacamole|topped)\b).*\b(potato (chips|crisps)|crisps|kerepek|(banana|tapioca|cassava|sweet potato|bitter gourd|jackfruit|kale|vegetable|veggie|apple) chips|pringles|lay'?s|mister potato|chipster)\b/i, 'potato-chips'],
    // sheet 7 (western): priority rules
    [/\b(waffles?|croffle)\b/i, 'waffle'],
    [/^(?!.*\b(prawns?|udang|bar|kuih|cookies?|baby|infant|energy)\b).*\b(corn ?flakes|cereal|froot loops|cheerios|frosties|coco pops|koko krunch|honey stars|nestum)\b/i, 'cereal'],
    [/^(?!.*\b(burger|wrap|rice|nasi|egg tart|biscuit|coleslaw|wedges|mashed|whipped|potato|nuggets?|double down|bowl|jalapeno|bomber|honey butter|mee|noodles?|soup|curry|bun|raw|mentah)\b).*\b(kfc .*chicken|texas chicken .*(fried|chicken)|korean fried chicken|fried chicken wings?|chicken wings?|chicken tenders?|drumlets?|mcdonald'?s ayam goreng)\b/i, 'fried-chicken'],
    [/^(?!.*\b(ramen|noodles?|buldak|samyang|soup|lasagn\w*|salad|sauce|pastitsio)\b).*\b(carbonara|alfredo|mac(aroni)? (and |& |n )?cheese|creamy (pasta|spaghetti))\b/i, 'carbonara'],
    [/^(?!.*\b(sauce|kering|dry|squash|noodles?|ramen|soup|salad|parmigiana|sticks|lasagn\w*|layered)\b).*\b(spaghetti|bolognese|penne|fettuc\w+|linguine|pasta|aglio olio|arrabbiata)\b/i, 'spaghetti'],
    [/^(?!.*\bgrilled\b).*\bfish ?(and|&|n'?) ?chips\b/i, 'fish-and-chips'],
    [/\b(bubble tea|boba|bobba|pearl milk tea|brown sugar (pearl|boba)|milk tea with pearls|with pearl|pearl (medium|regular|large)|deerioca|tapioca)\b/i, 'bubble-tea'],
    [/\b((iced|ice|cold) (latte|coffee|cappuccino|mocha|americano|cold brew)|latte ais|kopi (susu |o |c )?ais|iced white coffee|cold brew)\b/i, 'iced-latte'],
    [/\b(lemon tea|teh limau|teh o ais limau|iced lemon|limau ais|(iced|ice) tea|teh ais limau|peach tea)\b/i, 'iced-lemon-tea'],
    [/\b(asam laksa|assam laksa|laksa asam|laksa penang)\b/i, 'asam-laksa'],
    [/\b(mee rebus|mi rebus|mie rebus)\b/i, 'mee-rebus'],
    [/\b(soto|sotong soup)\b/i, 'soto-ayam'],
    [/\b(prawn mee|mee udang|mee hailam|har mee|hae mee|hokkien prawn)\b/i, 'prawn-mee'],
    [/^(?!.*\b(prawn|soup|udang)\b).*\bhokkien (mee|noodles?)\b/i, 'hokkien-mee'],
    [/\b(pan mee|ban mian)\b/i, 'pan-mee'],
    [/\b((bihun|bee hoon|beehoon|mihun|meehoon|vermicelli) goreng|fried (bee hoon|beehoon|bihun|vermicelli))\b/i, 'bihun-goreng'],
    [/\b(mee siam|mi siam|bee hoon siam)\b/i, 'mee-siam'],
    [/\b(yong tau foo|yong tau fu|yong tofu|ytf)\b/i, 'yong-tau-foo'],
    [/\b(sup tulang|bone soup|sup tulang merah)\b/i, 'sup-tulang'],
    [/\b(sup ayam|chicken soup)\b/i, 'sup-ayam'],
    [/\btom ?y[au]m\b/i, 'tom-yum'],
    [/\bpho\b/i, 'pho'],
    [/\bramen\b/i, 'ramen'],
    [/\b((wonton|wanton|wantan) soup|dumpling soup|sui kow)\b/i, 'wonton-soup'],
    [/\b(fish head curry|curry fish head|kepala ikan)\b/i, 'curry-fish-head'],
    [/\bnasi lemak\b/i, 'nasi-lemak'],
    [/\b(nasi goreng|fried rice)\b/i, 'nasi-goreng'],
    [/\b(mee goreng|mi goreng|mie goreng|fried noodles?|maggi goreng)\b/i, 'mee-goreng'],
    [/\b(char kuey teow|char kway teow|char koay teow|kuey teow goreng)\b/i, 'char-kuey-teow'],
    [/\b(laksa|curry mee)\b/i, 'laksa'],
    [/\b(roti canai|roti prata|prata|roti telur|roti tisu|roti planta)\b/i, 'roti-canai'],
    [/^(?!.*\b(bee hoon|bihun|noodles?|mee|burger|burrito|wrap|pizza)\b).*\b(satay|sate)\b/i, 'satay'],
    [/\bnasi kandar\b/i, 'nasi-kandar'],
    [/\brendang\b/i, 'rendang'],
    [/^(?!.*\b(burrito|wrap|burger|pizza|sandwich|bun|roll)\b).*\b(chicken rice|nasi ayam|hainanese)\b/i, 'chicken-rice'],
    [/\b(wantan|wanton|wonton) (mee|noodles?)\b/i, 'wantan-mee'],
    [/\b(bak kut teh|bkt)\b/i, 'bak-kut-teh'],
    [/\bcendol\b/i, 'cendol'],
    [/\b(teh tarik|teh c|teh o|teh ais|teh susu|milk tea)\b/i, 'teh-tarik'],
    [/\b(kopi|kopitiam coffee)\b/i, 'kopi-o'],
    [/^(?!.*\b(cake|ice cream|candy|biscuits?|cookies?|bread|bun|jelly|pudding|wafer|bar)\b).*\b(coffee|latte|cappuccino|espresso|mocha)\b/i, 'kopi-o'],
    [/\b(kaya toast|roti bakar|half[- ]boiled|telur separuh masak)\b/i, 'kaya-toast'],
    [/\b(kuih|kueh) lapis\b/i, 'kuih-lapis'],
    [/\bonde[- ]?onde\b/i, 'onde-onde'],
    [/\b(seri|sri) muka\b/i, 'seri-muka'],
    [/\btalam\b/i, 'kuih-talam'],
    [/\b(ang ku|angku)\b/i, 'ang-ku-kuih'],
    [/\bkeria\b/i, 'kuih-keria'],
    [/\bpulut inti\b/i, 'pulut-inti'],
    [/\b(apam balik|ban chang kuih|martabak manis|terang bulan)\b/i, 'apam-balik'],
    [/\bcha cha\b/i, 'bubur-cha-cha'],
    [/\b(ais kacang|ice kacang|abc)\b/i, 'ais-kacang'],
    [/\b(pisang goreng|goreng pisang|banana fritters?)\b/i, 'pisang-goreng'],
    [/\bbahulu\b/i, 'kuih-bahulu'],
    [/\bdodol\b/i, 'dodol'],
    [/\b(tau fu fah|tau foo fah|tau huey|tahu bunga|douhua|beancurd pudding)\b/i, 'tau-fu-fah'],
    [/\b(pulut hitam|black glutinous rice)\b/i, 'pulut-hitam'],
    [/\b(mango sticky|pulut mangga|khao niao mamuang)\b/i, 'mango-sticky-rice'],
    [/^(?!.*\b(rice|nasi|burger|sandwich|wrap|salad|noodles?|mee|pizza|bun|roll|pie|soup|sup|puff|pau|roti|laksa|cheese)\b).*\b(ayam goreng|fried chicken|chicken fried)\b/i, 'ayam-goreng'],
    [/\b(ayam masak merah|chicken masak merah)\b/i, 'ayam-masak-merah'],
    [/^(?!.*\b(rice|nasi|burger|sandwich|wrap|salad|noodles?|mee|pizza|bun|roll|pie|soup|sup|puff|pau|roti|laksa)\b).*\b(ayam percik|percik|ayam bakar|grilled chicken|bbq chicken)\b/i, 'ayam-percik'],
    [/^(?!.*\b(rice|nasi|burger|sandwich|wrap|salad|noodles?|mee|pizza|bun|roll|pie|soup|sup|puff|pau|roti|laksa)\b).*\b(chicken curry|kari ayam|curry chicken|gulai ayam)\b/i, 'chicken-curry'],
    [/^(?!.*\b(rice|nasi|burger|sandwich|wrap|salad|noodles?|mee|pizza|bun|roll|pie|soup|sup|puff|pau|roti|laksa)\b).*\b(ikan bakar|grilled fish|bbq fish|ikan panggang|stingray)\b/i, 'ikan-bakar'],
    [/\b(sambal sotong|sotong (sambal|goreng|masak)|squid sambal|calamari|fried squid)\b/i, 'sambal-sotong'],
    [/^(?!.*\b(crackers?|keropok|chips?|snack|rice|nasi|noodles?|mee)\b).*\b(butter prawns?|udang (mentega|butter|goreng tepung)|prawn butter|salted egg prawns?|fried prawns?|tempura prawns?)\b/i, 'butter-prawns'],
    [/\b((chil+i|black pepper|butter|salted egg|singapore) crab|crab (curry|masak)|ketam (masak|cili|lada hitam)|kari ketam)\b/i, 'chilli-crab'],
    [/^(?!.*\b(kuih|kueh|kek|crepe|burger|sandwich|sub|subway)\b).*\b(telur dadar|dadar|omel+ette?)\b/i, 'telur-dadar'],
    [/\b(kangkung|water spinach|morning glory)\b/i, 'kangkung-belacan'],
    [/\b((tempeh|tempe|tauhu|tahu|tofu|beancurd|bean curd) (goreng|fried)|goreng (tempeh|tempe|tauhu|tahu)|fried (tempeh|tempe|tofu|beancurd))\b/i, 'tempeh-tauhu'],
    [/^(?!.*\b(sandwich|burger|pie|noodles?|rice|nasi|mee|salad|wrap|pizza|bun|roll|sauce|seasoning|sub|subway|tuna|fish|salmon|tofu|cheese)\b).*\bsteak\b/i, 'beef-steak'],
    [/^(?!.*\b(rice|nasi|burger|sandwich|wrap|salad|noodles?|mee|pizza|bun|roll|pie|soup|sup|puff|pau|roti|laksa|sub|subway)\b).*\b(roast(ed)? chicken|ayam panggang|rotisserie|ayam golek|whole chicken)\b/i, 'roast-chicken'],
    [/^(?!.*\b(burger|sandwich|rice|nasi|biryani|briyani|satay|soup|sup|pie|pizza|bun|roti|mee|noodles?|murtabak|martabak|chapati|capati|keema|prata|canai|sub|subway)\b).*\b(gulai kambing|kari kambing|mutton curry|lamb curry|kambing masak|curry (mutton|lamb)|rogan josh|kambing|mutton)\b/i, 'gulai-kambing'],
    [/\b(steamed fish|ikan (stim|kukus)|(kukus|stim) ikan|teochew steamed fish)\b/i, 'steamed-fish'],
    [/^(?!.*\b(rice|nasi|noodles?|mee|laksa)\b).*\b(asam pedas|assam pedas|ikan asam|asam rebus|ikan masak asam)\b/i, 'asam-pedas'],
    [/^(?!.*\b(cereal|bar|cake|biscuits?|cookies?|ice cream|wafer)\b).*\bmilo\b/i, 'iced-milo'],
    [/\b(sirap bandung|bandung|rose syrup|air sirap)\b/i, 'sirap-bandung'],
    [/\b((air|fresh|young|green) (kelapa|coconut)|coconut water|kelapa muda|air kelapa|buko)\b/i, 'fresh-coconut'],
    [/\b(sugar ?cane|air tebu|tebu)\b/i, 'sugarcane-juice'],
    [/\b(soy ?(a )?milk|soya (bean )?(milk|drink)|susu soya|air soya|soybean milk)\b/i, 'soy-milk'],
    [/\b(orange juice|jus oren|orange drink|air oren)\b/i, 'orange-juice'],
    [/\b(watermelon (juice|jus)|jus tembikai|air tembikai|tembikai (juice|jus))\b/i, 'watermelon-juice'],
    [/\b(mango (smoothie|lassi|shake|juice|jus)|smoothie|jus mangga|lassi)\b/i, 'mango-smoothie'],
    [/^(?!.*\b(ice cream|cake|candy|biscuits?|cookies?|chicken|marinade|sauce)\b).*\b(cola|coke|pepsi|sprite|fanta|7 ?up|soft drink|soda|carbonated|root beer|ginger ale|sarsi|green spot)\b/i, 'cola'],
    [/\b(isotonic|sports drink|100 ?plus|gatorade|pocari|energy drink|electrolyte|powerade|vitamin water|red ?bull|monster energy)\b/i, 'isotonic-drink'],
    [/^(?!.*\b(melon|chestnut|spinach|coconut|cress|buffalo|biscuit|crackers?|tuna|sardines?|chunks|noodles?|pasta|jelly|canned)\b).*\b((mineral|drinking|plain|spring|bottled|sparkling) water|air mineral|air kosong)\b|^water$/i, 'mineral-water'],
    [/\b(chrysanthemum|krisantemum|kek ?wa|herbal tea|chinese tea|green tea|jasmine tea|oolong|barley tea|ginger tea|teh halia|roselle)\b/i, 'chrysanthemum-tea'],
    [/^(?!.*\b(chocolate|tea|bun|bread|cake|cookies?|biscuits?|pudding|powder|ice cream|candy|jelly|coffee|shake|rice|soup|cereal|cheese|yogh?urt|lassi|soy|soya|almond|oat|coconut|tart|flan|tofu|pau|roll|bar|custard|toffee|corn|fish|bee hoon|bihun|fudge|barfi|condensed|evaporated|creamer|pekat|sejat|steamed|butter|sweet)\b).*\b(milk|susu)\b/i, 'fresh-milk'],
    [/\b(curry puffs?|karipap)\b/i, 'curry-puff'],
    [/^(?!.*\b(soto|mee|noodles?|nasi|seblak|gado|rice|tuaran|bowl|dan bing|belanda|basah|fresh|soft|goi cuon|summer|turon|banana)\b).*\b(spring rolls?|popiah|popia|lumpia|lumpiang|cha gio|egg rolls?|poh pia)\b/i, 'spring-rolls'],
    [/^(?!.*\b(soto|mee|noodles?|nasi|seblak|gado|rice|bowl)\b).*(\b(popiah|popia|lumpia)\b|fresh spring rolls?|goi cuon|summer rolls?)/i, 'popiah'],
    [/^(?!.*\b(cream bun|roti ban|gardenia|massimo|polo bun|bor lor|pang susie|biapong|xiao long|bun bo|bun cha|burger|cheeseburger|brioche|toast|hot ?dog|bolo|pineapple bun|sausage|sticky rice)\b).*\b(pau|bao|baozi|siopao|steamed buns?|mantou|manapua)\b/i, 'pau'],
    [/^(?!.*\bmanis\b).*(\b(murtabak|mutabak|martabak)\b|mughlai paratha)/i, 'murtabak'],
    [/\b(thosai|tosai|dosa|dosai)\b/i, 'thosai'],
    [/^(?!.*\b(with (tandoori|dhal|dhall|chicken)|butter chicken|set naan|kari|curry|keema)\b).*\b(naan|chapati|chapatti|capati)\b/i, 'naan-chapati'],
    [/\bparatha\b/i, 'roti-canai'],
    [/^(?!.*\b(pav|pisang|banana)\b).*\b(vadai|vada|vadas|wadai|bonda|bondas|pakora|bhaji)\b/i, 'vadai'],
    [/\b(egg tarts?|dan tat|pastel de nata|tart telur|custard tarts?)\b/i, 'egg-tarts'],
    [/\b(pineapple tarts?|tart nenas|tat nenas|nastar)\b/i, 'pineapple-tarts'],
    [/^(?!.*\b(soup|fritters?|cucur|bakwan|bun|pancake|cendol|bubur|drink|air jagung|nasi|dough|tamales?|aiskrim|ice cream)\b).*\b(corn on the cob|jagung (bakar|rebus|manis rebus|cup)|grilled (sweet )?corn|boiled (sweet )?(yellow )?corn|steamed (sweet )?corn|corn cobs?)\b/i, 'corn-on-the-cob'],
    [/^(?!.*\b(patty|patties|steak|sundae|onion rings?|hash browns?|fries|float|pie|sauce|kebab|bread)\b).*\b(burger|cheeseburger|hamburger|whopper|mcdeluxe|big mac|filet-o-fish)\b/i, 'burger'],
    [/^(?!.*\b(garlic bread|soup|lasagn\w*|spaghetti|drumlets|wings|salad|pasta|rice|dessert|cheesy bites|wedges|coleslaw|sauce)\b).*\bpizza\b/i, 'pizza'],
    [/^(?!.*\b(biscuits?|cookies?|bread|loaf|dorayaki|banh mi|spread|oreo|puff|ice cream)\b).*\b(sandwich|sandwiches|subway|toastie|panini|blt)\b/i, 'sandwich'],
    [/^(?!.*\b(kerabu|rojak|gado|pasembur|pasembor|yee sang|umai|hinava|latok|seybak|raita|thoke|som ?tam|papaya|fruit|nasi|mee|noodles?|pasta|potato salad|dressing|egg salad|tuna salad|larb|laab|lawar|nam tok|pleah|choila|gotukola|sambol|selat|kebab|doner|wrap|plate|sichuan|ulam|leaves|raw)\b).*\bsalads?\b/i, 'salad'],
    [/^(?!.*\b(with fries|and fries|chop|steak|maryland|gyros|burger|peas|set|loaded|wedges)\b).*\b(french fries|fries|curly fries|frozen fries)\b/i, 'french-fries'],
    [/^(?!.*\b(roll|soup)\b).*\b(hot ?dogs?|coney dog|chili cheese dog|corn dog)\b/i, 'hot-dog'],
    [/^(?!.*\bmilo\b).*\b(nuggets?|mcnuggets?)\b/i, 'chicken-nuggets'],
    [/^(?!.*\b(kuih|apam|martabak|crepe|dorayaki|pajeon|banh|surabi|kue|roti jala|durian|uttapam|appam|seafood|savory|savoury|fermented|rice|rolled|coconut|scallion|mussel|hopper|malpua|flatbread|sprout)\b).*\b(pancakes?|hotcakes?|hot cakes?)\b/i, 'pancakes'],
    [/^(?!.*\b(bar|cookies?|krunch|crunch|biscuits?|cake|boat|milk|acai|balls?|tart|crumble)\b).*\b(oatmeal|oats?|overnight oats|muesli|granola)\b/i, 'oatmeal'],
    [/^(?!.*\b(rice|nasi|burger|sandwich|banh|noodles?|mee|pad|bun|roti|congee|silog|tapsilog|egg tart|steamed|kerbau cake|avocado|galette|crepe)\b).*\b(sunny side up|telur mata kerbau|fried eggs?|bacon (and|&) eggs?|eggs? (and|&) bacon|english breakfast|full breakfast)\b/i, 'eggs-bacon'],
    // sheet 9 (fruit): fruit must be the first word of the name
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(buah )?(banana|pisang (mas|berangan|raja|awak|rastali|rebus|salai|emas|tanduk|abu))\b/i, 'banana'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(epal|apple)\b/i, 'apple'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(orange|mandarin|tangerine)\b/i, 'orange'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(buah )?(mango|mangga|mempelam)\b/i, 'mango'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(isi |buah )?durian\b/i, 'durian'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(buah )?(papaya|betik)\b/i, 'papaya'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(buah )?(watermelon|tembikai)\b/i, 'watermelon'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(buah )?(pineapple|nanas|nenas)\b/i, 'pineapple'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(grapes?|anggur)\b/i, 'grapes'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(strawberr(y|ies)|strawberi|stroberi)\b/i, 'strawberry'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(buah )?rambutan\b/i, 'rambutan'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(dragon ?fruit|buah naga|pitaya)\b/i, 'dragon-fruit'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(buah )?(mangosteen|manggis)\b/i, 'mangosteen'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(guava|jambu batu)\b/i, 'guava'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(buah )?(jackfruit|nangka|cempedak)\b/i, 'jackfruit'],
    [/^(?!.*\b(cake|kek|juice|jus|drink|smoothie|tart|tat|donut|doughnut|pie|goreng|fried|curry|kari|rice|nasi|pulut|pudding|sauce|chips|kerepek|fritters?|cucur|pakora|sorbet|yogh?urt|lassi|milk|susu|bun|polo|ice|ais|aiskrim|sago|sagu|salad|kerabu|pickle|pickled|acar|jam|muffin|bread|roti|cookies?|biscuits?|pizza|pork|prawn|udang|ikan|fish|chicken|ayam|soup|dessert|bowl|mochi|toffee|dodol|cendol|puff|pancake|porridge|bubur|tempoyak|stew|gulai|latte|tea|shake|powder|flavou?red|jelly|crumble|strudel|cider|vinegar|toast)\b)(avocado|avokado|alpukat)\b/i, 'avocado'],
    // sheet 10 (staples & veg): start-anchored ingredient names only
    [/^(?!.*\b(cake|cakes|fried|goreng|kuih|balls?|roll|triangle|uncooked|puffed|peanut|chicken|noodles?|paper|porridge|crackers?|vermicelli|flour|wine|pudding|salad)\b)(nasi putih|nasi perang|((steamed|cooked|boiled|plain) )?((white|brown|jasmine|basmati|glutinous) )?rice)\b/i, 'white-rice'],
    [/^(?!.*\b(roll|cream|bun|sandwich|toast)\b)((gardenia|massimo)\b.*\b(bread|loaf)\b|(white|wholemeal) bread|bread \((white|wholemeal|brown)|roti (putih|wholemeal|sourdough))/i, 'bread'],
    [/^(?!.*\b(sauce|spread|omelette|quesadilla|sticks|cake|burger|pizza|sandwich|toast)\b)(cheese \(|.*\b(cheese slices?|processed cheddar|cheddar slices?)\b)/i, 'cheese'],
    [/^(?!.*\b(goreng|fried|crispy|mapo|stir|stew|soup|jjigae)\b)(tauhu|tofu)\b/i, 'tofu'],
    [/^(?!.*\b(salad|wedges|puff|chips|fries|fried|goreng)\b)(potato|potatoes|baked potato|ubi kentang|kentang)\b/i, 'potato'],
    [/^(?!.*\b(fritter|doughnut|donut|goreng|fried|kuih|cake|chips)\b)(sweet potato|keledek|ubi keledek)\b/i, 'sweet-potato'],
    [/^(?!.*\b(sauce|paste|puree|ketchup|kuey teow|canned)\b)tomato\b/i, 'tomato'],
    [/^(?!.*\bcake\b)(carrot|carrots|lobak merah)\b/i, 'carrot'],
    [/^(?!.*\b(goreng|fried|stir)\b)(broccoli|brokoli)\b/i, 'broccoli'],
    [/^(?!.*\b(sauce|risotto|tofu|truffle|melt|seafood)\b)(mushrooms?|shiitake|enoki|cendawan)\b/i, 'mushroom'],
    [/^(?!.*\b(coconut|soup|stir|goreng|fried|belacan|garlic|oyster|sauce|masak|tiram sauce|bunga|cauliflower)\b)(cabbage|kobis|lettuce|bok choy|pak choy|choy sum|sawi|spinach|bayam|kailan)\b/i, 'cabbage'],
    [/^(?!.*\b(pickle|pickled|acar|salad|kerabu|soup)\b)(cucumber|timun)\b/i, 'cucumber'],
    [/^(?!.*\b(sambal|goreng|curry|pajeri|stir|fried|salted)\b)(eggplant|brinjal|aubergine|terung)\b/i, 'eggplant'],
    [/^(?!.*\b(sauce|paste|dip|pan mee|cheese|dog|powder|belacan|crab|prawn|noodles?|chicken|fried|goreng)\b)(chilli|chili|cili|lada (merah|hijau)|capsicum|bell pepper)\b/i, 'chilli'],
    [/^(?!.*\b(butter|sauce|satay|chocolate|chicken|milk|croissant|cake|biscuits?|cookies?)\b)(peanuts?|kacang tanah|kacang rebus|groundnuts?|almonds?|mixed nuts|kacang gajus|kacang walnut|cashew nuts?)\b/i, 'peanuts'],
    // sheet 11 (meat & seafood)
    [/^(?!.*\b(burger|patty|kebab|lasagna)\b)(daging lembu kisar|ayam kisar|raw (lean |regular )?minced|minced (beef|chicken|pork|lamb|meat)|ground (beef|pork|chicken|turkey|meat))/i, 'minced-meat'],
    [/^(?!.*\b(liver|gizzard|egg|soup|satay|curry|rice|goreng|fried|bakar|panggang|masak|rendang|percik|katsu|teriyaki|chop)\b)(dada ayam|peha ayam|drumstick ayam|kepak ayam|(raw )?(skinless )?chicken (breast|thigh|drumstick|wing))/i, 'chicken-breast'],
    [/^(raw )?whole chicken\b|^ayam (utuh|keseluruhan|stim)\b|\b(white cut chicken|poached chicken|chicken sajji)\b/i, 'whole-chicken'],
    [/^(raw (local )?beef|daging lembu (batang pinang|sirloin|tempatan))/i, 'raw-steak'],
    [/^(perut babi|pork belly|raw pork|daging babi loin)/i, 'pork-belly'],
    [/^(?!.*\b(roll|dog|hotdog|bun|burger|nuggets?)\b)(sausage|sosej|frankfurter)\b/i, 'sausages'],
    [/^(?!.*\b(burger|cheeseburger|toastie|crepe|sandwich|blt)\b)(bacon|beef bacon|turkey bacon|streaky|ham\b(?! (chim|sui))|salami|luncheon meat|spam)/i, 'bacon'],
    [/^(?!.*\b(teriyaki|don|sushi|nigiri|roll|maki|sandwich|poke|bowl|sashimi)\b)(salmon|ikan salmon|raw (atlantic )?salmon)\b/i, 'salmon-fillet'],
    [/^(?!.*\b(fried|goreng|masak|fritters?|cucur|omelette|paste|chili|sambal|petai|telur masin|butter|nestum|kung pao|chicken|curry|kari|noodles?|crackers?|keropok|mee|biryani|rice|bowl)\b)(prawns?|shrimps?|udang|raw (fresh |tiger )?prawns)\b/i, 'prawns'],
    [/^(?!.*\b(goreng|fried|masak|sambal|curry|kari|tepung|balls?)\b)(squid|sotong|calamari|cuttlefish|raw (fresh )?squid)\b/i, 'squid'],
    [/^(?!.*\b(chilli|chili|cili|masak|black pepper|stick|omelette|soup|noodles?|bee hoon|curry)\b)(crab|ketam)\b/i, 'crab'],
    [/^(?!.*\b(sauce|sambal|masak|soup|goreng|fried|noodles?|omelette|chowder|mushroom|rockefeller)\b)(clams?|lala|kerang|cockles?|mussels?|kupang|oysters?|scallops?|raw (blood )?cockles)\b/i, 'clams'],
    [/^(?!.*\b(noodles?|soup|mee|bee hoon|bihun|congee|bubur|yong tau foo|skewer)\b)(fish ?balls?|bebola ikan|hotpot fish ball|surimi|crab stick|fishcake)/i, 'fish-balls'],
  // sheet 12 tail
  [/\bprotein bar\b/i, 'protein-bar'],
  [/^(?!.*\b(smoothie|pancakes?|oatmeal|oats|pudding|cake|balls|toast|waffles?|bar)\b)(protein shake|ready.to.drink protein|whey protein|.*\bwhey\b.*\b1 scoop|orgain|premier protein|casein|pea protein|amway nutrilite|optimum nutrition|myprotein|muscletech|dymatize|rule 1|bsn|allmax|soylent)/i, 'protein-shake'],
  [/^(?!.*\b(sausage|egg|eggs|benedict|florentine|royale|bacon|cups?|mcmuffin|keto|english)\b)(.*\bmuffins?\b)/i, 'muffin'],
  [/^(?!.*\b(sandwich|chicken|tuna|croffle|benedict)\b)(.*croissant|pain au chocolat)/i, 'croissant'],
  [/^(?!.*\b(vada|vadai|kuih|keria|sweet potato|medu|balushahi)\b)(?=.*\b(doughnut|donut)s?\b)/i, 'donut'],
  [/^(oreo|arnott|munchy's lexu|julie's (peanut|cheese|hershey)|tiger biskuat|lotte (koala|pepero)|good time|biskut (cip|oat|marie)|subway .*cookie|better sandwich|protein cookie|quaker oat cookies|putri salju|kue semprit|lidah kucing|tart nanas)/i, 'cookies'],
  [/^(chocolate bar|coklat (gelap|putih)|snickers|mars bar|twix|kit ?kat|kitkat|nestle kitkat|toblerone|ferrero rocher|kinder bueno|beng-beng|chocolate wafer|cadbury (dairy|zip)|tango wafer)/i, 'chocolate-bar'],
  [/^(?!.*\b(donut|doughnut|muffin|cupcake|pancakes?|waffles?|sundae|kuih|kue|apam|ma lai go)\b)(kek\b|cake\b|(secret recipe|mr diy|apollo|gardenia twiggies|london choco|lotte choco|domino's chocolate lava)(?=.*\bcake\b|.*choco pie)|.*\b(black forest|red velvet|victoria sponge|chocolate fudge|opera cake|carrot walnut|lava cake|cheesecake|lamington|tiramisu|pandan chiffon|sponge cake)\b)/i, 'cake-slice'],
  [/^(?!.*\b(drink|lassi|smoothie|chicken|lamb|korma|kadhi|raita|tzatziki|oats|granola|frozen|eggs|salad|bliss)\b)(yogh?urt|greek yogh?urt|skyr|dutch lady low fat yogh?urt|farm fresh natural|marigold 0%|sunglo|mishti doi|juju dhau|shrikhand)/i, 'yoghurt'],
  [/biryani|briyani|biriyani|khao mok/i, 'briyani'],
  [/^(?!.*\b(wrapped|leaf|banana|skewers?|plate|rice|bowl|burger|egg|pastry|lettuce|romaine|tortilla wrap|bacon|cheese slices)\b)(shawarma|.*\b(wrap|burrito|gyros)\b|kebab \(|kfc twister)/i, 'kebab-wrap'],
  [/^(mochi|daifuku)/i, 'mochi'],
  // sheet 13 tail (generic fallbacks, only for foods nothing else matched)
  [/^(?!.*\b(chicken|ayam|ikan|daging|beef|pomfret|liver|kailan|pancake|rice balls|ketupat|set|masak|crepe|noodles?|sambal|durian|paste)\b)(fish sauce|oyster sauce|(dark |light |sweet |salty )?soy sauce|kicap|tomato (sauce|ketchup)|chil+i sauce|bbq sauce|black pepper sauce|mushroom sauce|garlic sauce|cheese sauce|sweet chil+i sauce|hoisin|plum sauce|teriyaki sauce|pad thai sauce|peanut sauce|fermented|sweet soy|light salty|malaysian chili sauce)/i, 'soy-sauce'],
  [/^(?!.*\b(telur|udang|prawns?|kerang|ikan|lala|terung|petai|tempoyak|tempe|eggs?|anchov\w*|bilis|sardin\w*|grilled|poached|stink|chicken|durian)\b)(sambal|chil+i paste|curry paste|tomato paste)/i, 'sambal-jar'],
  [/^(?!.*\b(puff|bun|crepe|roti)\b)(kaya\b|jam \(|honey \(|maple syrup|sugar syrup|chocolate spread|nutella|coconut egg jam|gardenia auntie|yeo's kaya|gardenia quickbites kaya|buttercup|cheese spread)/i, 'jam-jar'],
  [/^(peanut butter|lady's choice peanut|skippy)/i, 'peanut-butter'],
  [/^(mr diy (tam tam|mi-mi|super ring)|twisties|mamee (monster|noodle snack)|super ring|seaweed snack)/i, 'snack-bag'],
  [/^(?!.*\b(milk|chicken|tart)\b)(cashews?|walnuts?|pistachios?|brazil nuts?|almonds?|macadamias?|hazelnuts?|pecans?|mixed nuts|trail mix|kacang pistachio)/i, 'mixed-nuts'],
  [/^(?!.*\b(french|brioche|ricotta|avocado|vegemite|fava|melt|sandwich)\b)(.*\btoast\b)/i, 'toast-egg'],
  [/^(?!.*\bsandwich\b)(scrambled eggs?|western omelet|egg foo yong|fu yong egg|telur dadar|telur hancur|.*\bomelet(te)?\b|.*\bfrittata\b)/i, 'scrambled-eggs'],
  [/^(?!.*\b(sos|sauce|monster|double decker|oats|congee|coffee|cereal)\b)(maggi|mamee|nissin|mi sedaap|mie sedaap|indomie|cup noodles?|instant (noodles?|mee))/i, 'cup-noodles'],
  [/^(?!.*\b(soup|sup|kerabu|salad|per 100g|rojak|tea|omapodi|muruku|rebus|laksa|curry|kari|kuah|boat|th'ng|pho|ramen|udon|dried|jalangkote|basah|pastry)\b)(?=.*\b(goreng|fried|stir-fried|wok|char|dry|kering|kampua|kolo|dan dan|chow mein|lo mein|yakisoba|japchae|pad see ew|basah)\b)(.*\bnoodles?\b|mee\b|kuey teow|kway teow|kwetiau|bihun|yakisoba|mie\b)/i, 'fried-noodles'],
  [/^(?!.*\b(kerabu|salad|per 100g|rojak|tea|omapodi|muruku|jalangkote|pastry)\b)(.*\bnoodles?\b|mee\b|kuey teow|bihun|kolo mee|lam mee|loh mee|lor mee|hokkien mee|sang nyuk|tuaran|beaufort|kon lau|bak chor mee)/i, 'noodle-soup'],
  [/^(?!.*\b(noodles?|mee|bihun|macaroni|sweet|tong sui|tang yuan|nasi|maggi|stew|venison|boar|powder|base|ambuyat)\b)(sup\b|.*\bsoup\b|.*\bbroth\b|.*\bbak kut teh\b)/i, 'clear-soup'],
  [/^(?!.*\b(noodles?|mee|powder|paste|tea|teh|katsu|don|nasi|roti|puri|poori|twisties|cup|maggi|mamee|mie|indomie|balls|sauce|dates|bhatura|pongal)\b)(.*\b(curry|kari|gulai|masala|dal|dhal|korma|kurma|lodeh|opor|varuval)\b)/i, 'yellow-curry'],
  [/^(tandoori chicken|ayam tandoori|nando's (1\/4|1\/2|chicken)|ayam tikka|chicken tikka|secret recipe chicken cornish)/i, 'roast-chicken'],
  [/^(chicken katsu|domino's crazy chicken|texas chicken jalapeno|marrybrown lucky plate)/i, 'fried-chicken'],
  [/^(?!.*\b(burger|cheeseburger|spaghetti|lasagna|kebab|salad|kerabu|floss|serunding|balls?|hotpot|skewer|sandwich|soup|sup|noodles?|raw|per 100g|rice|bolognese|tofu|tauhu|sambar|chap chye|jjigae|gudeg|sayur|cockles|jengkol|fish|ikan|molee|macher|shukto|souvlaki|bouillabaisse|moqueca|feijoada|pozole|curry|kukul|or lam|roast|rack|mince|tempoyak)\b)(.*\b(rendang|stew)\b|daging|beef|babi|pork|lamb|mutton|kambing|brongkos|semur|kare-kare|saksang|narcissus|tulang babi|claypot)/i, 'beef-stew'],
  [/^(?!.*\b(burger|sandwich|rice|bubur|porridge|lasagna|biscuit|mashed|coleslaw|crackers?|floss|serunding|feet|salad|kerabu|soup|sup|noodles?|nasi|naan|set|slice|wing|canned|raw|brand|stock|banh|roti|sausage|frankfurter|gyoza|hor fun|kebab|chiki|karaage)\b)(ayam|.*\bchicken\b)/i, 'stir-fry-chicken'],
  [/^(?!.*\b(sauce|salad|kerabu|floss|serunding|balls?|paste|fritters?|cucur|sprouts|beansprouts|kale|bean|roe|telur|cereal|nestum|cheong|squid|sotong|prawns?|udang|shrimp|crab|nasi|rice|powder|bee hoon|muruku|dahfa|hotpot|don|canh|pempek|cakes|raw|mentah|terung|otak|dried|kering|bosou|pinasakan|fermented|curry)\b)(ikan|fish|dory|salmon|.*\bfish\b)/i, 'grilled-fish'],
  [/^(?!.*\b(salad|kerabu|fritters?|cucur|paste|mango|cheong|sambal petai|stink)\b)(prawns?|udang|cereal prawn)/i, 'prawns'],
  [/^(?!.*\b(salad|kerabu)\b)(squid|sotong)/i, 'squid'],
  [/^(?!.*\b(sambal|prawns?|udang|ikan|fish|salted|egg|juice|milk|cooked|canned|baked|tempura|pastry|puff|pickle|pickled|salad|kerabu|porridge|cracker|durian|side|kidney|black|mung|red|stink|raw|mentah)\b)(sayur|sawi|kailan|bendi goreng|terung goreng|okra|long beans|green beans|bean sprouts|chinese stir-fry|cabbage in coconut|mixed vegetables in|fried brinjal|fried okra|kacang buncis|mui choy|bayam|kangkung|petola|choy)/i, 'stir-fry-veg'],
  [/^(?!.*\b(per 100g|raw|balls?|porridge)\b)(.*\bfried rice\b|nasi goreng|chao fan)/i, 'fried-rice'],
  // sheet 14 tail
  [/^(beer|wine|whisky|vodka|tuak|cocktail \()/i, 'beer'],
  [/^(mixed fruit salad|fruit cocktail|fruit salad|rojak buah)/i, 'fruit-salad'],
  [/^(?!.*\b(yogh?urt|float|creamer|milk|chocolate|tea|coffee|juice|bcaa|thicken|huel|bird's nest|gong cha|chia|panas|hot|wedang|sekoteng|bandrek|jamu|herbal|yakult|boost|glucerna)\b)(.*\b(drink|soda|cola|pepsi|sprite|100 ?plus|fanta|7up|cordial|ribena)\b)/i, 'soft-drink-can'],
  [/^(yakult(?! ace)|vitagen|yeo's soy|air kacang soya|soya cincau|susu badam|dutch lady (pure|chocolate)|farm fresh chocolate|ultra milk|marigold hl|almond milk)/i, 'milk-carton'],
  [/^(?!.*\b(polo|bolo|pineapple bun|chang|sausage|chaat)\b)(gyoza|wonton|siew mai|siu mai|har gow|xiao long bao|potstickers?|jiaozi|fun gor|ham sui gok|dim sum|cp chicken gyoza|buff momo|veg momo|yomari|chai kueh|soon kueh)/i, 'dumplings'],
  [/^(kuih|kueh|kue) (makmur|semperit|cornflakes|kapit|belanda|cincin)|^kue ape/i, 'cookies'],
  [/^(?!.*\b(raw|mentah|beras)\b)(kuih|kueh|kue|wajik|ang ku|png kueh|teochew peng kueh|pulut panggang)/i, 'kuih-tray'],
  [/^(?![^(]*\b(cake|bingka|drink|apple|chia|glutinous|sticky|rice|bread|roti|kelantanese|toffee)\b)([^(]*\b(pudding|puding|flan|panna cotta|creme brulee|agar-agar|custard|watalappan)\b)/i, 'pudding'],
  [/^nasi .*\b(kosong|plain)\b/i, 'white-rice'],
  [/^(?!.*\b(cake|pancake|balls|custard|pudding|dumpling|glutinous|per 100g|raw|porridge|paper|noodles?|vermicelli|wine|vinegar|flour|bran|pandan|palm sugar|rambai|fermented|blue pea|crackers?|cakes?)\b)(nasi\b|.*\brice\b)/i, 'nasi-campur'],
  // mapping pass: leftovers that clearly fit an existing icon (match the name part before the bracket)
  [/^(?![^(]*\b(sauce|rice|burger king|king)\b)[^(]*\b(cheeseburger|burger)\b/i, 'burger'],
  [/^(karaage|jollibee chickenjoy|wiener schnitzel|tonkatsu|chicken katsu)/i, 'fried-chicken'],
  [/^(roasted duck|duck \(|duck$|bbq duck|peking duck)/i, 'roast-chicken'],
  [/^turkey (breast|ham)/i, 'chicken-breast'],
  [/^(australian meat pie|sausage roll|pei dan sou|kaya puff|[^(]*\bcurry puff\b)/i, 'curry-puff'],
  [/^(?![^(]*\b(pineapple|nasi)\b)[^(]*\btart\b/i, 'egg-tarts'],
  [/^(polo bun|bolo bao|bor lor)/i, 'pau'],
  [/^(?![^(]*\b(salad|kerabu|spread|biscuits?)\b)[^(]*\b(sandwich|banh mi)\b/i, 'sandwich'],
  [/^(currywurst|sausage)/i, 'sausages'],
  [/^(?![^(]*\b(energy|rice balls|glutinous|bun cha|seblak)\b)[^(]*\b(fish balls?|fish ball|beef balls?|meatballs?|meatball|bebola)\b/i, 'fish-balls'],
  [/^(cuttlefish|octopus)/i, 'squid'],
  [/^(?![^(]*(onigiri|bento|sushi|nigiri))[^(]*\bsalmon\b/i, 'salmon-fillet'],
  [/^braised egg/i, 'boiled-eggs'],
  [/^(?![^(]*\b(soup|sauce|burger|fu fa)\b)[^(]*\b(tofu|tahu|tauhu|bean curd)\b/i, 'tofu'],
  [/^(?![^(]*\b(soup|risotto|sauce|burger|sandwich|tofu|melt|quiche)\b)[^(]*\b(mushrooms?|fungus|enoki)\b/i, 'mushroom'],
  [/^[^(]*(cauliflower|kobis bunga|bunga kobis)/i, 'broccoli'],
  [/^[^(]*\bcabbage\b/i, 'cabbage'],
  [/^corn\b/i, 'corn-on-the-cob'],
  [/^(ubi kayu|cassava|misro)/i, 'sweet-potato'],
  [/^(loaded baked potato|baked potato)/i, 'potato'],
  [/^(?![^(]*pudding)(bread\b|focaccia|baguette)/i, 'bread'],
  [/^(luchi|bhatura|amritsari kulcha|malabar parotta|parotta|paratha|kulcha|roti bom|roti tortilla)/i, 'naan-chapati'],
  [/^(hoppers?|egg hopper|appam|uttapam|serabi|malpua|taiwanese dan bing|bara\b)/i, 'pancakes'],
  [/^(?![^(]*\b(bean|durian)\b)(rava upma|gluten-free polenta|[^(]*\bporridge\b)/i, 'oatmeal'],
  [/\bbubur ayam\b/i, 'congee'],
  [/^(jack 'n jill|mr diy|nestle mat kool)/i, 'snack-bag'],
  [/^(julie's|pop-tarts|baby teething)/i, 'cookies'],
  [/^m&m/i, 'chocolate-bar'],
  [/^(belacan|blended chil+i paste|sambal terung|spicy sweet soy sauce dip|[^(]*cili boh)/i, 'sambal-jar'],
  [/^(?![^(]*\b(noodles?|rice|tuna|asparagus)\b)([^(]*\b(ketchup|mayonnaise|olive oil|minyak zaitun)\b|maggi sos)/i, 'soy-sauce'],
  [/^(oat milk|ensure|carnation|huel|anlene|milk powder)/i, 'milk-carton'],
  [/^[^(]*\bjuice\b|^air jus|^jus /i, 'orange-juice'],
  [/^[^(]*\b(chendol|cendol|selendang mayang)\b/i, 'cendol'],
  [/^(gyudon|katsudon)/i, 'nasi-campur'],
  [/^(brahim's [^(]*curry|sambar|aloo gobi|avial|undhiyu|thali)/i, 'yellow-curry'],
  [/^(?![^(]*\bnoodles?\b)[^(]*\b(salad|coleslaw|lawar|urap)\b/i, 'salad'],
  [/^(?![^(]*\b(burger|sandwich|noodles?|soup|sup|rice|bun|dumplings?|pie|roll|balls?|raw|mentah|salad|kerabu|per 100g|stock|floss|lung|serunding|hotpot)\b)([^(]*\b(pork|beef|lamb|mutton|veal|venison|ribs)\b|gudeg|pozole|dendeng)/i, 'beef-stew'],
  ];
  function foodIcon(name){
    var n = String(name || '');
    for (var i = 0; i < FOOD_ICON_RULES.length; i++){
      if (FOOD_ICON_RULES[i][0].test(n)) return FOOD_ICON_RULES[i][1];
    }
    return '';
  }
  var FOOD_EMOJI_DEFAULT = '\uD83C\uDF7D\uFE0F'; // plate with cutlery

  function foodEmoji(name){
    var n = String(name || '');
    for (var i = 0; i < FOOD_EMOJI_RULES.length; i++){
      if (FOOD_EMOJI_RULES[i][0].test(n)) return FOOD_EMOJI_RULES[i][1];
    }
    return FOOD_EMOJI_DEFAULT;
  }

  // Only ever put a plain https address in an <img src>; anything else
  // (javascript:, data:, odd characters) is ignored and the emoji shows.
  function safeImageUrl(u){
    if (typeof u !== 'string') return '';
    u = u.trim();
    if (/^http:\/\//i.test(u)) u = 'https://' + u.slice(7);
    return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
  }

  function foodThumbHtml(p, tappable){
    var emoji = foodEmoji(p.product_name);
    var img = safeImageUrl(p._image);
    if (img && tappable){
      // Photo tile that opens the big viewer (see openFoodPhoto)
      return '<button type="button" class="food-thumb food-thumb-btn" data-action="open-food-photo" data-emoji="' + emoji + '" aria-label="View photo of ' + esc(p.product_name) + '"><img src="' + esc(img) + '" alt="" decoding="async" referrerpolicy="no-referrer"></button>';
    }
    if (img){
      return '<span class="food-thumb" data-emoji="' + emoji + '"><img src="' + esc(img) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>';
    }
    var ico = foodIcon(p.product_name);
    if (ico) return '<span class="food-thumb has-ico"><img class="food-ico" src="data/icons/' + ico + '.webp" alt="" loading="lazy" decoding="async"></span>';
    return '<span class="food-thumb">' + emoji + '</span>';
  }

  // <img> load errors don't bubble, so listen in the capture phase once
  // on the results list and swap a broken photo for its emoji.
  // Big photo viewer. Open Food Facts stores each picture at several sizes
  // (…100.jpg, …200.jpg, …400.jpg, full), so the 100/200px thumbnail's
  // address is turned into the 400px one for the viewer; if that size
  // isn't there, the thumbnail itself is shown instead.
  function openFoodPhoto(){
    var f = ui.selectedFood;
    var thumb = f ? safeImageUrl(f.image) : '';
    if (!thumb) return;
    var big = thumb.replace(/\.(100|200)\.(jpe?g|png|webp)(\?.*)?$/i, '.400.$2$3');
    var img = document.getElementById('photoOverlayImg');
    img.setAttribute('data-thumb', thumb);
    img.removeAttribute('data-tried-thumb');
    img.alt = f.name || 'Food photo';
    img.src = big;
    document.getElementById('photoOverlayName').textContent = f.name + (f.brand ? ' \u00b7 ' + f.brand : '');
    document.getElementById('photoOverlay').classList.remove('hidden');
  }

  function closeFoodPhoto(){
    document.getElementById('photoOverlay').classList.add('hidden');
    document.getElementById('photoOverlayImg').removeAttribute('src'); // stop any download in progress
  }

  document.getElementById('photoOverlayImg').addEventListener('error', function(e){
    var img = e.target;
    if (!img.getAttribute('src')) return; // we just cleared it on close
    var thumb = img.getAttribute('data-thumb');
    if (thumb && !img.getAttribute('data-tried-thumb') && img.getAttribute('src') !== thumb){
      img.setAttribute('data-tried-thumb', '1');
      img.src = thumb; // the larger size isn't available — show the small one
    } else {
      document.getElementById('photoOverlayName').textContent = 'Couldn\u2019t load this photo.';
    }
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && !document.getElementById('photoOverlay').classList.contains('hidden')) closeFoodPhoto();
  });

  function foodThumbErrorHandler(e){
    var img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    var box = img.parentNode;
    if (box && box.classList && box.classList.contains('food-thumb')){
      box.textContent = box.getAttribute('data-emoji') || FOOD_EMOJI_DEFAULT;
      box.removeAttribute('data-action'); // nothing to open any more
      box.classList.remove('food-thumb-btn');
    }
  }
  document.getElementById('foodSearchResults').addEventListener('error', foodThumbErrorHandler, true);
  document.getElementById('addMealBody').addEventListener('error', foodThumbErrorHandler, true);

