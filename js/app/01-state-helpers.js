/*! SaviorFuel — Copyright (c) 2026 Xavier Chua (Savior). All rights reserved. See LICENSE. */
  // =========================================================
  // SAVIORFUEL — local-state working version
  // Visual shell copied from SaviorFit Logger. Data layer here
  // is 100% local (in-memory + localStorage) — no Firebase, no
  // auth, no sync across devices yet. That's intentional: this
  // is meant to prove out the actual product before wiring up a
  // backend. Data model (meal shape, settings shape) is written
  // to already look like what would eventually go in Firestore,
  // so swapping in real persistence later is mostly mechanical.
  //
  // Storage key: everything lives under one localStorage key,
  // 'saviorfuel_local_v1'. Bump the version suffix if the shape
  // of STORE ever changes in a way that would break old data.
  // =========================================================

  var STORAGE_KEY = 'saviorfuel_local_v1';

  // Fiber/sugar/sodium defaults follow the FDA's general Daily
  // Values (28g, 50g added sugar, 2300mg) — same starting-point
  // convention as the Mifflin-St Jeor calculator below: a sensible
  // default, always overridable in Settings.
  var DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 200, fat: 65, sugar: 50, sodium: 2300, water: 2500 };

  var MEAL_CATEGORIES = [
    { id: 'breakfast', label: 'Breakfast' },
    { id: 'morning-snack', label: 'Morning Snacks' },
    { id: 'lunch', label: 'Lunch' },
    { id: 'evening-snack', label: 'Evening Snacks' },
    { id: 'dinner', label: 'Dinner' }
  ];
  var CATEGORY_LABELS = MEAL_CATEGORIES.reduce(function(acc, c){ acc[c.id] = c.label; return acc; }, {});

  // Sensible default for whichever category button is pre-selected
  // when the Add Meal overlay opens — always overridable by the user.
  function suggestCategoryForNow(){
    var h = new Date().getHours();
    if (h < 10) return 'breakfast';
    if (h < 12) return 'morning-snack';
    if (h < 15) return 'lunch';
    if (h < 18) return 'evening-snack';
    return 'dinner';
  }
  // Which meal the Add flow is for: the one picked with "+ Add to <meal>" on the Log tab, otherwise whatever fits the time of day.
  function addCategoryNow(){ return (typeof ui !== 'undefined' && ui.addCategory) || suggestCategoryForNow(); }
  var DEFAULT_PROFILE = { sex: 'male', age: 25, heightCm: 170, weightKg: 70, activityLevel: 'moderate', goal: 'maintain' };
  var DEFAULT_APP_SETTINGS = { unit: 'metric', haptic: true, density: 'comfortable', corners: 'rounded', theme: 'dark', bgArt: true, overviewMode: '3d', macroCardCollapsed: true, aiScanConsent: false };
  var APP_VERSION = '0.1.0';

  function cmToIn(cm){ return cm / 2.54; }
  function inToCm(inches){ return inches * 2.54; }
  function kgToLb(kg){ return kg * 2.20462; }
  function lbToKg(lb){ return lb / 2.20462; }

  var ACTIVITY_LEVELS = [
    { id: 'sedentary', label: 'Sedentary · no exercise', mult: 1.2 },
    { id: 'light', label: 'Light · 1-3 days/wk', mult: 1.375 },
    { id: 'moderate', label: 'Moderate · 3-5 days/wk', mult: 1.55 },
    { id: 'active', label: 'Very active · 6-7 days/wk', mult: 1.725 },
    { id: 'extra', label: 'Extra active · hard job + training', mult: 1.9 }
  ];
  var GOAL_OPTIONS = [
    { id: 'lose', label: 'Lose weight', pct: -0.20, protein: 2.0, desc: 'About 20% under maintenance, with high protein to keep your muscle.' },
    { id: 'maintain', label: 'Maintain', pct: 0, protein: 1.6, desc: 'Around maintenance calories with balanced protein.' },
    { id: 'gain', label: 'Build muscle', pct: 0.10, protein: 2.0, desc: 'About 10% over maintenance, with high protein to build muscle.' }
  ];
  // Sensible limits for the body details (stored as kg / cm)
  var PLAN_LIMITS = { age: [10, 100], heightCm: [100, 250], weightKg: [30, 300] };
  function goalById(id){ return GOAL_OPTIONS.find(function(g){ return g.id === id; }) || GOAL_OPTIONS[1]; }

  var STORE = loadStore();
  var state = { tab: 'log' };
  var ui = {
    histFind: false,      // History filter bar is open
    dayOpen: null,
    histShow: 21,
    histMonth: null,
    settingsOpen: null,
    logDay: null,         // day the Log tab shows (null = today); set by the week strip
    selectedFood: null,   // { name, brand, per100g: {cal,protein,carbs,fat} } once a search result is tapped
    grams: 100,            // serving size in grams, scales the selected food's macros
    prefillName: null, prefillCal: null, prefillProtein: null, prefillCarbs: null, prefillFat: null,
    prefillFiber: null, prefillSugar: null, prefillSodium: null,
    searchDebounce: null,
    dangerZoneOpen: false,
    justFilledFood: false,
    selectedCategory: 'breakfast', // set properly each time the Add Meal overlay opens
    insightsView: 'today', // 'today' | 'trends' — which Insights sub-tab panel is showing
    serving: null // { unitId, qty } — how the picked food is being measured (see the serving picker)
  };

  function loadStore(){
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { meals: [], goals: Object.assign({}, DEFAULT_GOALS), profile: Object.assign({}, DEFAULT_PROFILE), appSettings: Object.assign({}, DEFAULT_APP_SETTINGS), savedFoods: [], myFoods: [], water: {}, photos: {} };
      var parsed = JSON.parse(raw);
      // Merge (not replace) so existing saved goals keep whatever the
      // person already customized, while newly-added goal fields
      // (e.g. fiber/sugar/sodium) backfill from defaults instead of
      // coming back undefined.
      parsed.goals = Object.assign({}, DEFAULT_GOALS, parsed.goals || {});
      parsed.meals = Array.isArray(parsed.meals) ? parsed.meals.map(sanitizeMeal).filter(Boolean) : [];
      if (!parsed.profile) parsed.profile = Object.assign({}, DEFAULT_PROFILE);
      // Same merge reasoning as goals above — existing density/corners/
      // unit choices are kept, newly-added settings (theme) backfill.
      parsed.appSettings = Object.assign({}, DEFAULT_APP_SETTINGS, parsed.appSettings || {});
      // Foods picked from a live search/scan, cached locally so the
      // same food can be found and re-logged without network next
      // time (see saveFoodToCache / searchSavedFoods).
      if (!parsed.savedFoods) parsed.savedFoods = [];
      if (!Array.isArray(parsed.myFoods)) parsed.myFoods = [];
      if (!parsed.water || typeof parsed.water !== 'object') parsed.water = {};
      parsed.photos = cleanPhotos(parsed.photos, parsed.meals);
      parsed.weights = cleanWeights(parsed.weights);
      return parsed;
    } catch (e){
      console.error('SaviorFuel: failed to load local store, starting fresh —', e);
      // Keep the unreadable data (the next save would overwrite it) so it can still be recovered.
      try { if (raw) localStorage.setItem(STORAGE_KEY + '_unreadable', raw); } catch (e2){}
      return { meals: [], goals: Object.assign({}, DEFAULT_GOALS), profile: Object.assign({}, DEFAULT_PROFILE), appSettings: Object.assign({}, DEFAULT_APP_SETTINGS), savedFoods: [], myFoods: [], water: {}, photos: {} };
    }
  }

  /* ---- Weight history: STORE.weights = { 'YYYY-MM-DD': kg }, one entry per day (logging again the same day replaces it).
     STORE.goalsWeightKg = the bodyweight your daily goals were last worked out at (drives the "Update your goals?" prompt). */
  function cleanWeights(w){
    var out = {};
    if (!w || typeof w !== 'object') return out;
    Object.keys(w).forEach(function(k){
      var v = Number(w[k]);
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v >= PLAN_LIMITS.weightKg[0] && v <= PLAN_LIMITS.weightKg[1]) out[k] = Math.round(v * 10) / 10;
    });
    return out;
  }
  function recordWeight(kg){
    if (!STORE.weights || typeof STORE.weights !== 'object') STORE.weights = {};
    STORE.weights[todayKey()] = Math.round(kg * 10) / 10;
    if (STORE.appSettings) delete STORE.appSettings.weightAssumed;   // a real weight now exists
  }
  // [{ key, kg }] oldest first. With nothing logged yet, the profile weight counts as today's point.
  function weightSeries(){
    var w = STORE.weights || {};
    var keys = Object.keys(w).sort();
    if (!keys.length) return STORE.profile && STORE.profile.weightKg && !(STORE.appSettings && STORE.appSettings.weightAssumed) ? [{ key: todayKey(), kg: STORE.profile.weightKg }] : [];
    return keys.map(function(k){ return { key: k, kg: w[k] }; });
  }

  // If the browser refuses the write (storage full, private mode, blocked)
  // the meal only exists in memory and vanishes on reload — so say so once,
  // instead of failing silently.
  var saveFailureShown = false;
  function saveStore(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(STORE));
      saveFailureShown = false;
      syncSchedule();
    } catch (e){
      console.error('SaviorFuel: failed to save local store —', e);
      if (!saveFailureShown){
        saveFailureShown = true;
        alert('SaviorFuel couldn\u2019t save to this device (storage may be full or blocked by the browser), so what you just logged may be lost when you close the app. Export a backup from Settings, and free up some space or leave private browsing.');
      }
    }
  }

  // Ask the browser not to evict our saved data when it's short of space
  // (best effort — the browser decides).
  if (navigator.storage && navigator.storage.persist){
    try { navigator.storage.persist(); } catch (e){}
  }

  // Coerces one logged meal to safe types: numbers are numbers (a string
  // "100" would make totals concatenate text), never negative, and an
  // entry without a usable timestamp is dropped. Used for stored data and
  // for imported backups.
  // Small meal photos (from the AI scan) live in STORE.photos, keyed by id,
  // and meals point at them with photoId. Only small JPEG data URLs are
  // accepted, photos no meal uses are dropped, and only the newest few
  // are kept so the app's storage can't fill up.
  function cleanPhotos(photos, meals){
    var out = {};
    if (!photos || typeof photos !== 'object') return out;
    var used = {};
    (meals || []).forEach(function(m){ if (m.photoId) used[m.photoId] = m.loggedAt; });
    Object.keys(photos).forEach(function(id){
      var d = photos[id];
      if (used[id] != null && typeof d === 'string' && d.indexOf('data:image/jpeg;base64,') === 0 && d.length < 120000) out[id] = d;
    });
    return capPhotos(out, meals);
  }
  function capPhotos(photos, meals){
    var MAX_PHOTOS = 60;
    var ids = Object.keys(photos);
    if (ids.length <= MAX_PHOTOS) return photos;
    var when = {};
    (meals || []).forEach(function(m){ if (m.photoId) when[m.photoId] = Math.max(when[m.photoId] || 0, m.loggedAt); });
    ids.sort(function(a, b){ return (when[b] || 0) - (when[a] || 0); });
    ids.slice(MAX_PHOTOS).forEach(function(id){ delete photos[id]; });
    return photos;
  }
  function mealPhoto(m){
    return (m && m.photoId && STORE.photos && STORE.photos[m.photoId]) || '';
  }

  function sanitizeMeal(m){
    if (!m || typeof m !== 'object') return null;
    var t = Number(m.loggedAt);
    if (!isFinite(t) || t <= 0) return null;
    var n = function(v, max){ v = Number(v); return (isFinite(v) && v > 0) ? Math.min(v, max) : 0; };
    var clean = {
      id: String(m.id || ('m_' + t + '_' + Math.random().toString(36).slice(2, 7))),
      name: String(m.name == null ? 'Food' : m.name).slice(0, 120),
      calories: n(m.calories, 20000), protein: n(m.protein, 2000), carbs: n(m.carbs, 2000), fat: n(m.fat, 2000),
      fiber: n(m.fiber, 1000), sugar: n(m.sugar, 2000), sodium: n(m.sodium, 50000),
      loggedAt: t
    };
    if (typeof m.category === 'string') clean.category = m.category;
    if (typeof m.photoId === 'string' && m.photoId) clean.photoId = m.photoId.slice(0, 60);
    return clean;
  }

  function esc(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function dateKey(ts){
    var d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function todayKey(){ return dateKey(Date.now()); }

  // Date key for N calendar days ago. Counted by calendar (via the noon
  // of today), NOT by subtracting N x 24 hours — on the day clocks go
  // forward (a 23-hour day) that subtraction lands a day too early and
  // "yesterday" / the weekly chart skip or repeat a date.
  function dateKeyDaysAgo(n){
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return dateKey(d.getTime());
  }

  function formatDateLabel(key){
    var today = todayKey();
    var yesterday = dateKeyDaysAgo(1);
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    var d = new Date(key + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function mealsForDay(key){
    return STORE.meals.filter(function(m){ return dateKey(m.loggedAt) === key; });
  }

  function totalsFor(meals){
    var t = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
    meals.forEach(function(m){
      t.calories += m.calories || 0;
      t.protein += m.protein || 0;
      t.carbs += m.carbs || 0;
      t.fat += m.fat || 0;
      t.fiber += m.fiber || 0;
      t.sugar += m.sugar || 0;
      t.sodium += m.sodium || 0;
    });
    return t;
  }

  function pct(value, goal){
    if (!goal) return 0;
    return Math.max(0, Math.min(100, Math.round((value / goal) * 100)));
  }

  // Same as pct() but never caps the upper end — for anywhere the
  // actual number is shown (ring center text, etc.), so 250g against
  // a 100g goal reads as "250%", not a misleading capped "100%".
  // Fill widths/ring offsets still need pct() (capped) since they're
  // physically bounded by the container — this one's for display only.
  function pctUncapped(value, goal){
    if (!goal) return 0;
    return Math.max(0, Math.round((value / goal) * 100));
  }

  function showNutrientInfo(){
    document.getElementById('nutrientInfoTitle').textContent = 'Macros';
    // Reference image rather than generated text — kept as its own
    // file rather than inlined,
    // same as the background art, so it's cacheable and doesn't
    // bloat the HTML.
    document.getElementById('nutrientInfoBody').innerHTML =
      '<div class="nutrient-info-text">' +
        '<p><b style="color:var(--c-protein-text)">Protein</b> — builds and repairs muscle. Meat, fish, eggs, dairy, tofu, beans.</p>' +
        '<p><b style="color:var(--c-carbs)">Carbs</b> — your main fuel. Rice, bread, noodles, fruit, potatoes.</p>' +
        '<p><b style="color:var(--c-fat)">Fat</b> — hormones and steady energy. Oils, nuts, avocado, fatty fish.</p>' +
      '</div>';
    document.getElementById('nutrientInfoOverlay').classList.remove('hidden');
  }

  function closeNutrientInfo(){
    document.getElementById('nutrientInfoOverlay').classList.add('hidden');
  }

  /* =========================================================
     RENDER — LOG TAB
     ========================================================= */
  // ---- Log day / week strip helpers ----
  // ui.logDay is the day the Log tab is showing (null = today). The week
  // strip above the ring lets you flip to any earlier day and see/edit it.
  function addDaysKey(key, n){
    var d = new Date(key + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return dateKey(d.getTime());
  }
  function logDayKey(){
    var t = todayKey();
    return (ui.logDay && ui.logDay <= t) ? ui.logDay : t;
  }
  function weekStartKey(key){
    var d = new Date(key + 'T00:00:00');
    return addDaysKey(key, -((d.getDay() + 6) % 7)); // Monday
  }

  var HERO_RINGS = [
    { id: 'cal',     r: 119, w: 14 },
    { id: 'protein', r: 99,  w: 9 },
    { id: 'carbs',   r: 85,  w: 9 },
    { id: 'fat',     r: 71,  w: 9 }
  ];
