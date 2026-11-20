  function reEsc(t){ return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function hlHtml(text, q){
    var toks = String(q || '').toLowerCase().split(/\s+/).filter(function(t){ return t.length >= 2; });
    if (!toks.length) return esc(text);
    var re = new RegExp('(' + toks.map(reEsc).join('|') + ')', 'ig');
    return String(text).split(re).map(function(part, i){ return i % 2 ? '<span class="hl">' + esc(part) + '</span>' : esc(part); }).join('');
  }
  function splitFoodName(name){
    var m = /^(.+?)\s*\((.+)\)\s*$/.exec(String(name || ''));
    return m ? { main: m[1], extra: m[2] } : { main: String(name || ''), extra: '' };
  }
  function shortFoodName(name){ return splitFoodName(name).main || String(name || ''); }
  var LAST_SERV_KEY = 'saviorfuel_lastserv_v1', lastServCache = null;
  function lastServAll(){
    if (lastServCache) return lastServCache;
    try { lastServCache = JSON.parse(localStorage.getItem(LAST_SERV_KEY) || '{}') || {}; } catch (e) { lastServCache = {}; }
    return lastServCache;
  }
  function lastServKey(n){ return String(n || '').toLowerCase().trim().slice(0, 80); }
  function rememberServing(){
    var f = ui.selectedFood, u = f && ui.serving ? currentServingUnit() : null;
    if (!f || !u || !(ui.serving.qty > 0)) return;
    var q = roundQty(ui.serving.qty, u);
    var unitTxt = u.id === 'serving' ? (q === 1 ? 'serving' : 'servings') : (u.id === 'g' || u.id === 'oz') ? u.id : String(u.label || '').split(' \u00B7 ')[0];
    var all = lastServAll(), k = lastServKey(f.name);
    delete all[k];
    all[k] = { u: u.id, q: q, t: q + ' ' + unitTxt };
    var keys = Object.keys(all);
    if (keys.length > 200) keys.slice(0, keys.length - 200).forEach(function(x){ delete all[x]; });
    try { localStorage.setItem(LAST_SERV_KEY, JSON.stringify(all)); } catch (e) {}
  }

  function foodRowHtml(p, i){
    var cal = Math.round(p.nutriments['energy-kcal_100g'] || 0);
    // Right-hand tag is just the calories; the serving basis goes in
    // the small line under the name so the name gets the room.
    var meta = [];
    var brand = p.brands ? p.brands.split(',')[0].trim() : '';
    if (brand) meta.push(esc(brand));
    if (p._mine) meta.push(esc(p._servingLabel || '1 serving'), 'My food');
    else if (p._builtin) meta.push(esc(p._servingLabel || '1 serving'), 'Built-in \u00B7 estimate');
    else if (p._source === 'saved') meta.push(esc(p._servingLabel || '100g'), 'Saved');
    else if (p._source === 'techapi'){ if (p._serving) meta.push(esc(p._serving)); }
    else meta.push('per 100 g');
    if (p._source === 'saved' ? p._note : foodDataNote(p.nutriments)) meta.push('<span class="row-warn">⚠ check data</span>');
    var sn = splitFoodName(p.product_name);
    var ls = lastServAll()[lastServKey(p.product_name)];
    if (ls && ls.t && !(ls.u === 'serving' && ls.q === 1) && !(ls.u === 'g' && ls.q === 100)) meta.push('<span class="last-serv">last: ' + esc(ls.t) + '</span>');
    var star = p._mine
      ? '<button type="button" class="food-fav edit" data-action="edit-my-food" data-id="' + esc(p._myId) + '" aria-label="Edit ' + esc(p.product_name) + '">' + EDIT_SVG + '</button>'
      : p._builtin ? ''
      : p._source === 'saved'
      ? '<button type="button" class="food-fav' + (p._fav ? ' on' : '') + '" data-action="toggle-fav" data-name="' + esc(p.product_name) + '" aria-label="' + (p._fav ? 'Remove from favorites' : 'Add to favorites') + '" aria-pressed="' + (!!p._fav) + '">' + STAR_SVG + '</button>'
      : '';
    return '<div class="food-suggest-item" role="button" tabindex="0" data-action="pick-food" data-index="' + i + '">' +
      foodThumbHtml(p) +
      '<div class="food-suggest-name">' +
        '<div class="food-suggest-title">' + hlHtml(sn.main, rowHl) + (sn.extra ? '<small>' + esc(sn.extra) + '</small>' : '') + '</div>' +
        (meta.length ? '<div class="brand">' + meta.join(' · ') + '</div>' : '') +
      '</div>' +
      star +
      '<div class="food-suggest-tag">' + cal + ' kcal</div>' +
    '</div>';
  }

  // Empty search box: show your pinned favorites, then the foods you
  // logged most recently (the saved-foods cache is already newest-first),
  // so a food you eat often is one tap away.
  function renderFoodHome(){
    var resultsEl = document.getElementById('foodSearchResults');
    if (!resultsEl) return;
    var all = STORE.savedFoods || [];
    var mine = myFoodProducts();
    var favs = all.filter(function(f){ return f._fav; });
    var recents = all.filter(function(f){ return !f._fav; }).slice(0, 8);
    var products = mine.concat(favs, recents);
    foodSearch = { id: searchRequestId, query: '', products: products, pending: 0, stale: false };
    ui.lastSearchProducts = products;
    var html = '<div class="food-home-actions">' +
      '<button type="button" data-action="open-quick-add">+ Quick add</button>' +
      '<button type="button" data-action="open-my-food">+ New food</button></div>';
    if (products.length === 0){
      var emptyNote = '<div class="food-suggest-status">Foods you log show up here for one-tap logging. Tap the star to pin your favorites, or create your own with New food.</div>';
      resultsEl.innerHTML = html + emptyNote;
      // Brand-new log: offer a few popular local foods so the first meal is one tap away.
      var homeState = foodSearch;
      loadBuiltinFoods().then(function(){
        if (foodSearch !== homeState || foodSearch.query) return;
        var pop = popularFoods();
        if (!pop.length) return;
        foodSearch.products = pop;
        ui.lastSearchProducts = pop;
        var el = document.getElementById('foodSearchResults');
        if (!el) return;
        el.innerHTML = html + '<div class="food-home-label">Popular in Malaysia</div>' +
          pop.map(function(p, i){ return foodRowHtml(p, i); }).join('') +
          '<div class="food-suggest-status">Foods you log show up here too. Tap the star to pin favorites.</div>';
      });
      return;
    }
    if (mine.length) html += '<div class="food-home-label">My foods</div>' + mine.map(function(p, i){ return foodRowHtml(p, i); }).join('');
    if (favs.length) html += '<div class="food-home-label">Favorites</div>' + favs.map(function(p, i){ return foodRowHtml(p, mine.length + i); }).join('');
    if (recents.length) html += '<div class="food-home-label">Recent</div>' + recents.map(function(p, i){ return foodRowHtml(p, mine.length + favs.length + i); }).join('');
    resultsEl.innerHTML = html;
  }

  function toggleFavorite(name){
    var key = (name || '').trim().toLowerCase();
    var entry = (STORE.savedFoods || []).filter(function(f){ return f.product_name.trim().toLowerCase() === key; })[0];
    if (!entry) return;
    if (entry._fav) delete entry._fav; else entry._fav = true;
    saveStore();
    maybeVibrate();
    if (!foodSearch.query) renderFoodHome(); else renderFoodSearchResults();
  }

  function renderFoodSearchResults(){
    var resultsEl = document.getElementById('foodSearchResults');
    if (!resultsEl) return;

    // Nothing fresh yet and the previous query's list is still up:
    // leave it alone (no flash-to-empty) and just say we're updating.
    if (foodSearch.stale){
      if (!resultsEl.querySelector('.food-suggest-status')){
        resultsEl.insertAdjacentHTML('beforeend', '<div class="food-suggest-status">Updating...</div>');
      }
      return;
    }

    var products = foodSearch.products;
    var trimmed = foodSearch.query;
    var exactMatch = products.some(function(p){ return p.product_name.toLowerCase() === trimmed.toLowerCase(); });
    // Pinned above the list whenever what's typed isn't already an
    // exact match below — same "use what I typed" pattern as
    // SaviorFit Logger's custom-exercise option — so a genuinely
    // uncommon or local dish can still be added in one tap even
    // when none of the sources have it.
    var customBtn = exactMatch ? '' :
      '<button type="button" class="food-suggest-custom" data-action="use-custom-food-name" data-name="' + esc(trimmed) + '">Use \u201c' + esc(trimmed) + '\u201d</button>';

    rowHl = trimmed;
    var rows = products.map(foodRowHtml).join('');
    rowHl = '';

    var status = '';
    if (foodSearch.pending > 0) status = '<div class="food-suggest-status">' + (products.length ? 'Searching more...' : 'Searching...') + '</div>';
    else if (products.length === 0) status = '<div class="food-suggest-status">No matches — add it as a custom food above, or type it in manually.</div>';

    resultsEl.innerHTML = customBtn + rows + status;
    ui.lastSearchProducts = products; // stashed so pick-food can look up by index without re-fetching
  }

  function runFoodSearch(query){
    var resultsEl = document.getElementById('foodSearchResults');
    if (!resultsEl) return;
    if (searchAbort) searchAbort.abort(); // drop the previous query's requests
    searchAbort = new AbortController();
    var signal = searchAbort.signal;
    var thisRequest = ++searchRequestId;
    var trimmed = query.trim();

    // Saved foods (your own cache, works offline) are local, so they
    // show immediately, listed first.
    var localSaved = searchSavedFoods(trimmed);
    var saved = localSaved.concat(searchBuiltinFoods(trimmed));
    var hadResults = !!resultsEl.querySelector('.food-suggest-item');
    foodSearch = { id: thisRequest, query: trimmed, products: saved, pending: 2, stale: hadResults && saved.length === 0 };
    renderFoodSearchResults();

    // First search of the session: the built-in list may still be loading;
    // when it arrives, slip its matches in right after your own foods.
    if (!builtinFoods && trimmed.length >= 2){
      loadBuiltinFoods().then(function(){
        if (thisRequest !== searchRequestId) return;
        var extra = searchBuiltinFoods(trimmed);
        if (!extra.length) return;
        foodSearch.products.splice.apply(foodSearch.products, [localSaved.length, 0].concat(extra));
        foodSearch.stale = false;
        renderFoodSearchResults();
      });
    }

    // Then the two online sources, each landing as soon as it answers.
    // Each can fail independently without taking the others down.
    [['USDA', fetchUSDA], ['Open Food Facts', fetchOpenFoodFacts]].forEach(function(src){
      searchFoodSource(src[0], trimmed, src[1], signal).then(function(list){
        if (thisRequest !== searchRequestId) return; // a newer search has since superseded this one
        foodSearch.pending--;
        foodSearch.products = foodSearch.products.concat(list);
        if (list.length > 0 || foodSearch.pending === 0) foodSearch.stale = false;
        renderFoodSearchResults();
      });
    });
  }

  // ---- Offline food cache: every food actually picked from a live
  // search/scan gets saved here (name + macros, not the logged
  // instance), so searching that same food again — even fully
  // offline — finds it instantly instead of needing network. Merged
  // into runFoodSearch() as a 4th source alongside Kalori/USDA/OFF.
  function saveFoodToCache(food){
    var key = (food.name || '').trim().toLowerCase();
    if (!key) return;
    var src = food.whole || food.per100g; // per-serving foods are saved on their own per-serving basis
    var entry = {
      product_name: food.name,
      brands: food.brand || '',
      _image: food.image || '',
      _note: food.dataNote || '',
      _source: 'saved',
      _servingLabel: food.whole ? (food.servingLabel || '1 serving') : '100g',
      nutriments: {
        'energy-kcal_100g': src.cal || 0,
        'proteins_100g': src.protein || 0,
        'carbohydrates_100g': src.carbs || 0,
        'fat_100g': src.fat || 0,
        'fiber_100g': src.fiber || 0,
        'sugars_100g': src.sugar || 0,
        'sodium_100g_mg': src.sodium || 0 // already normalized to mg by this point regardless of original source
      }
    };
    if (!food.whole){ // per-100 g foods keep their serving / household measures, so the picker offers them next time too
      entry._servingGrams = food.servingGrams || null;
      entry._servingSizeText = food.servingSizeText || null;
      entry._measures = food.measures || [];
    }
    // De-dupe by name so re-picking the same food refreshes its
    // numbers and bumps it back to most-recently-used, rather than
    // piling up duplicate entries.
    var prevEntry = (STORE.savedFoods || []).filter(function(f){ return f.product_name.trim().toLowerCase() === key; })[0];
    if (prevEntry && prevEntry._fav) entry._fav = true; // a pinned favorite stays pinned
    STORE.savedFoods = (STORE.savedFoods || []).filter(function(f){
      return f.product_name.trim().toLowerCase() !== key;
    });
    STORE.savedFoods.unshift(entry);
    if (STORE.savedFoods.length > 200) STORE.savedFoods.length = 200; // cap so it doesn't grow forever
    saveStore();
  }

  function searchSavedFoods(query){
    var q = query.trim().toLowerCase();
    if (!q) return [];
    var mine = myFoodProducts().filter(function(f){ return f.product_name.toLowerCase().indexOf(q) !== -1; });
    var saved = (STORE.savedFoods || [])
      .filter(function(f){ return f.product_name.toLowerCase().indexOf(q) !== -1; })
      .slice(0, 8);
    return mine.concat(saved);
  }

  /* ---- Built-in foods ----
     About 1,600 common foods (Malaysian dishes, kuih, drinks, staples, fruit,
     fast food) live in data/foods/*.txt, one food per line, values per
     serving. They are loaded in the background, searched on the phone (so
     they work offline) and shown after your own/saved foods, before the
     online sources. They are estimates, and are labelled that way. */
  var BUILTIN_FILES = ['rice-noodles-breakfast', 'malaysian-dishes', 'kuih-desserts-drinks', 'western-staples', 'fruit-veg-asian-more', 'malaysian-part1-malay', 'malaysian-part2-chinese-kopitiam', 'malaysian-part3-indian-mamak', 'malaysian-part4-nyonya-east-malaysia', 'malaysian-part5-drinks-fruit-staples', 'nutrition-part1-chains', 'nutrition-part2-packaged-brands', 'nutrition-part3-sg-th-id-ph-bn', 'nutrition-part4-japan-korea-vn-china', 'nutrition-part5-western-mideast-indian', 'nutrition-part6-raw-ingredients', 'nutrition-part7-snacks-bakery-fitness', 'nutrition2-part1-indonesian', 'nutrition2-part2-indo-brands-malaysian-regional', 'nutrition2-part3-convenience-hk-taiwan', 'nutrition2-part4-thai-vn-khmer-lao-burmese', 'nutrition3-part1-south-asian', 'nutrition3-part2-european-american-latin', 'nutrition3-part3-produce-meat-seafood', 'nutrition3-part4-healthy-special-diet', 'nutrition3-part5-dessert-cafe-bakery']; // file order = tie-break order in results
  var builtinFoods = null, builtinLoading = null;

  function parseBuiltin(text){
    var out = [];
    String(text || '').split('\n').forEach(function(line){
      if (!line || line.charAt(0) === '#') return;
      var p = line.split('|');
      if (p.length < 9 || !p[0]) return;
      var n = function(i){ var v = parseFloat(p[i]); return isFinite(v) && v > 0 ? v : 0; };
      var g = n(2);
      // "1 plate" -> "1 plate (300 g)" so the serving also works in grams / ounces
      var label = p[1] + ((g > 0 && !/(^|\s|\d)(g|ml)$/i.test(p[1])) ? ' (' + g + ' g)' : '');
      out.push({
        product_name: p[0], brands: '', _image: '', _note: '', _source: 'saved', _builtin: true,
        _servingLabel: label, _k: p[0].toLowerCase(),
        nutriments: { 'energy-kcal_100g': n(3), 'proteins_100g': n(4), 'carbohydrates_100g': n(5), 'fat_100g': n(6),
                      'fiber_100g': 0, 'sugars_100g': n(7), 'sodium_100g_mg': n(8) }
      });
    });
    return out;
  }

  function loadBuiltinFoods(){
    if (builtinFoods) return Promise.resolve(builtinFoods);
    if (!builtinLoading){
      builtinLoading = Promise.all(BUILTIN_FILES.map(function(f){
        return fetch('data/foods/' + f + '.txt')
          .then(function(r){ return r.ok ? r.text() : ''; })
          .catch(function(){ return ''; });
      })).then(function(texts){
        var all = [];
        texts.forEach(function(t){ all = all.concat(parseBuiltin(t)); });
        if (all.length) builtinFoods = all;
        else builtinLoading = null; // nothing came back (offline on first run): try again next time
        return all;
      });
    }
    return builtinLoading;
  }

  // Every word you typed must appear in the name; names that start with
  // what you typed (or match at the start of a word) come first.
  var POPULAR_QUERIES = ['nasi lemak', 'roti canai', 'teh tarik', 'mee goreng', 'char kuey teow', 'laksa'];
  function popularFoods(){
    var out = [], seen = {};
    POPULAR_QUERIES.forEach(function(q){
      var hit = searchBuiltinFoods(q)[0];
      if (hit && !seen[hit._k]){ seen[hit._k] = 1; out.push(hit); }
    });
    return out;
  }

  function searchBuiltinFoods(query){
    var q = query.trim().toLowerCase();
    if (!builtinFoods || q.length < 2) return [];
    var toks = q.split(/\s+/).filter(Boolean);
    var have = {};
    myFoodProducts().concat(STORE.savedFoods || []).forEach(function(f){ have[String(f.product_name || '').trim().toLowerCase()] = 1; });
    var scored = [];
    builtinFoods.forEach(function(f, idx){
      var k = f._k;
      if (have[k]) return;
      var score = 0;
      for (var i = 0; i < toks.length; i++){
        var at = k.indexOf(toks[i]);
        if (at === -1) return;
        var prev = at ? k.charAt(at - 1) : ' ';
        score += (prev === ' ' || prev === '(' || prev === '/') ? 0 : 2;
      }
      if (toks.length === 1 && k.indexOf(q) === 0) score -= 1; // a one-word search prefers names that start with it
      scored.push({ f: f, s: score + idx / 100000 }); // earlier in the files (the plain, common version) first
    });
    scored.sort(function(a, b){ return a.s - b.s; });
    return scored.slice(0, 12).map(function(x){ return x.f; });
  }

  function pickFoodResult(index){
    var p = ui.lastSearchProducts && ui.lastSearchProducts[index];
    if (!p) return;
    var nut = p.nutriments || {};

    if (p._source === 'techapi' || p._source === 'saved'){
      // Kalori's numbers are per SERVING (see its 'serving' field), and
      // saved entries keep whatever basis they were saved with — either
      // per serving too, or per 100 g (label '100g').
      var basis = {
        cal: nut['energy-kcal_100g'] || 0,
        protein: nut['proteins_100g'] || 0,
        carbs: nut['carbohydrates_100g'] || 0,
        fat: nut['fat_100g'] || 0,
        // Kalori (techapi.my) doesn't report these yet — fine to
        // default to 0. Saved entries always carry real numbers here.
        fiber: nut['fiber_100g'] || 0,
        sugar: nut['sugars_100g'] || 0,
        sodium: nut['sodium_100g_mg'] || 0
      };
      var label = p._serving || p._servingLabel || '1 serving';
      var from = p._source === 'techapi' ? 'Kalori' : (p._mine ? 'mine' : (p._builtin ? 'builtin' : 'saved'));
      var dataNote = p._source === 'saved' ? (p._note || '') : foodDataNote(nut);
      if (p._source === 'saved' && /^\s*100\s*g\s*$/i.test(p._servingLabel || '')){
        // saved per-100 g food: comes back with its serving / measures
        ui.selectedFood = {
          name: p.product_name, image: p._image || '', brand: p.brands ? p.brands.split(',')[0] : '', from: from,
          servingGrams: p._servingGrams || null, servingSizeText: p._servingSizeText || null,
          measures: p._measures || [], per100g: basis, dataNote: dataNote
        };
      } else {
        var sg = parseServingGrams(label);
        ui.selectedFood = {
          name: p.product_name, image: p._image || '', from: from,
          whole: basis, servingLabel: label, servingGrams: sg, measures: [], dataNote: dataNote
        };
        // A serving with a known weight can also be measured in g / oz
        if (sg){
          var k = 100 / sg;
          ui.selectedFood.per100g = {
            cal: basis.cal * k, protein: basis.protein * k, carbs: basis.carbs * k, fat: basis.fat * k,
            fiber: basis.fiber * k, sugar: basis.sugar * k, sodium: basis.sodium * k
          };
        }
      }
    } else {
      var n = nut;
      ui.selectedFood = {
        name: p.product_name,
        image: p._image || '',
        brand: p.brands ? p.brands.split(',')[0] : '',
        from: 'search',
        dataNote: foodDataNote(n),
        // Only OFF products reliably carry a serving size (contributor-
        // entered, e.g. "38 g" / "1 slice (38g)"); USDA's generic foods
        // bring household measures instead (see usdaToProductShape).
        servingGrams: (p._source === 'off' && p.serving_quantity > 0) ? p.serving_quantity : null,
        servingSizeText: (p._source === 'off' && p.serving_size) ? p.serving_size : null,
        measures: p._measures || [],
        per100g: {
          cal: n['energy-kcal_100g'] || 0,
          protein: n['proteins_100g'] || 0,
          carbs: n['carbohydrates_100g'] || 0,
          fat: n['fat_100g'] || 0,
          fiber: n['fiber_100g'] || 0,
          sugar: n['sugars_100g'] || 0,
          // USDA already gives mg (sodium_100g_mg); OFF gives g like
          // its other per-100g fields, so it needs the *1000 here.
          sodium: p._source === 'usda' ? (n['sodium_100g_mg'] || 0) : (n['sodium_100g'] || 0) * 1000
        }
      };
    }
    // Remember this food locally (name + macros) so searching for it
    // again works even offline — skip re-caching an item that was
    // itself picked from the cache, nothing new to learn from that.
    // Built-in foods count too, so what you log shows up under Recent (flagged so they keep their "estimate" label).
    if (p._source !== 'saved' || p._builtin){
      saveFoodToCache(ui.selectedFood);
      if (p._builtin && STORE.savedFoods[0]){ STORE.savedFoods[0]._builtin = true; saveStore(); }
    }
    initServing();
    applySelectedFoodToForm();
    if (ui.replaceAiIdx != null){ aiReplaceFromSelected(); return; }
    ui.justFilledFood = true;
    closeFoodSearchOverlay();
    openAddMealOverlay();
  }

  // "Search instead" on the AI scan sheet: the picked food replaces the
  // AI's guess, with its numbers coming from the food list, not the AI.
  function aiReplaceFromSelected(){
    var idx = ui.replaceAiIdx;
    var f = ui.selectedFood;
    var u = currentServingUnit();
    var q = (ui.serving && ui.serving.qty) || 0;
    closeFoodSearchOverlay();                 // also clears replace mode
    if (!aiScan.items[idx] || !f){ clearFoodSelection(); return; }
    var base = {
      calories: ui.prefillCal || 0, protein: ui.prefillProtein || 0, carbs: ui.prefillCarbs || 0,
      fat: ui.prefillFat || 0, fiber: ui.prefillFiber || 0, sugar: ui.prefillSugar || 0, sodium: ui.prefillSodium || 0
    };
    var name = String(f.name || 'Food').slice(0, 60);
    if (u && u.grams != null && u.grams * q > 0){
      var g = Math.round(u.grams * q);
      base.grams = g;
      aiScan.items[idx] = { name: name, grams: g, base: base, state: 'list', matchName: name };
    } else {
      base.grams = 100;                       // per-serving food with no weight: one serving, calories editable
      aiScan.items[idx] = { name: name, grams: 100, manual: true, base: base, state: 'list', matchName: name };
    }
    clearFoodSelection();
    renderAiScanItems();
    showToast('Swapped to ' + name);
  }

  // Recomputes the prefill macro values from the selected food and
  // the chosen serving (unit x amount): per-100 g foods scale by the
  // weight, a per-serving food with no known weight by the count.
  function applySelectedFoodToForm(){
    var f = ui.selectedFood;
    var u = currentServingUnit();
    var q = (ui.serving && ui.serving.qty) || 0;
    ui.prefillName = f.name;
    var src, factor;
    if (u.grams == null){ src = f.whole; factor = q; }
    else { src = f.per100g; factor = q * u.grams / 100; }
    ui.prefillCal = Math.round(src.cal * factor);
    ui.prefillProtein = Math.round(src.protein * factor);
    ui.prefillCarbs = Math.round(src.carbs * factor);
    ui.prefillFat = Math.round(src.fat * factor);
    ui.prefillFiber = Math.round((src.fiber || 0) * factor);
    ui.prefillSugar = Math.round((src.sugar || 0) * factor);
    ui.prefillSodium = Math.round((src.sodium || 0) * factor);
  }

  // Writes the computed prefill numbers into the visible Add Meal fields
  // (openAddMealOverlay does this once on open; this is for when the
  // serving unit or amount changes while the sheet is up).
  function syncMealFieldsFromPrefill(){
    var map = { mealCal: 'prefillCal', mealProtein: 'prefillProtein', mealCarbs: 'prefillCarbs', mealFat: 'prefillFat',
                mealSugar: 'prefillSugar', mealSodium: 'prefillSodium' };
    Object.keys(map).forEach(function(id){
      var v = ui[map[id]];
      document.getElementById(id).value = v != null ? v : '';
    });
    updateMealSummary();
  }

  function setServingQty(qty){
    ui.serving.qty = Math.max(0, qty);
    applySelectedFoodToForm();
    syncMealFieldsFromPrefill();
    var eq = document.getElementById('servingEq');
    if (eq) eq.textContent = servingEqText();
  }

  function setServingUnit(unitId){
    var f = ui.selectedFood;
    if (!f) return;
    var old = currentServingUnit();
    var next = servingUnitsFor(f).filter(function(u){ return u.id === unitId; })[0];
    if (!next || next.id === old.id) return;
    // keep the same amount of food: 1 serving (380 g) -> 380 g -> 13.4 oz.
    // The exact value is kept (only the number shown is rounded), so
    // switching units never nudges the calories by a rounding error.
    var qty = (old.grams != null && next.grams != null)
      ? (ui.serving.qty || 0) * old.grams / next.grams
      : next.defaultQty;
    ui.serving = { unitId: next.id, qty: qty };
    applySelectedFoodToForm();
    syncMealFieldsFromPrefill();
    refreshSelectedFoodBanner();
  }

  function clearFoodSelection(){
    ui.selectedFood = null;
    ui.serving = null;
    ui.editingMealId = null;
    ui.prefillName = ui.prefillCal = ui.prefillProtein = ui.prefillCarbs = ui.prefillFat =
      ui.prefillFiber = ui.prefillSugar = ui.prefillSodium = null;
  }

  /* =========================================================
     BARCODE SCANNER — native BarcodeDetector API (best support
     is Chrome/Chrome-based browsers on Android, which is exactly
     what the installed Play Store app runs on). No external
     library — if the API isn't available, we just tell the
     person to search by name instead rather than failing silently.
     ========================================================= */
  var scanState = { stream: null, loopId: null, detector: null };

