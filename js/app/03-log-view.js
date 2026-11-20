  function renderLog(){
    var viewKey = logDayKey();
    var isToday = viewKey === todayKey();
    var dayMeals = mealsForDay(viewKey).sort(function(a,b){ return b.loggedAt - a.loggedAt; });
    var totals = totalsFor(dayMeals);
    var g = STORE.goals;
    var left = g.calories - totals.calories;
    var overCal = g.calories > 0 && totals.calories > g.calories;

    var dayNext = addDaysKey(viewKey, 1) <= todayKey();
    var chevL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    var chevR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

    // Headline: greeting + "N kcal to go" (accent word), SaviorFit-style.
    var hr = new Date().getHours();
    var greet = isToday ? (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ' 👋' : formatDateLabel(viewKey);
    var bigNum = (g.calories > 0 ? Math.abs(Math.round(left)) : Math.round(totals.calories)).toLocaleString();
    var headWord = g.calories > 0 ? (overCal ? 'over' : (isToday ? 'to go' : 'left')) : 'eaten';

    // Hero card: what's next, a tip worked out from what's left, big Add button.
    var heroLab, heroTitle, heroTip;
    if (!isToday){
      heroLab = formatDateLabel(viewKey).toUpperCase();
      heroTitle = Math.round(totals.calories).toLocaleString() + ' kcal eaten';
      heroTip = 'Editing this day. Add or fix meals here.';
    } else if (g.calories > 0 && left <= 0){
      heroLab = 'TODAY';
      heroTitle = overCal ? 'Over goal' : 'Goal reached';
      heroTip = overCal ? 'You are ' + Math.abs(Math.round(left)).toLocaleString() + ' kcal over. A lighter next meal evens it out.' : 'You hit your calories for today. Nice.';
    } else {
      var nextCat = suggestCategoryForNow(), noneAhead = false;
      // If this slot is already covered but the day isn't finished, point at the next meal that still has room
      // (so the card never says "covered" while hundreds of kcal are left).
      if (g.calories > 0){
        var startAt = 0;
        MEAL_CATEGORIES.forEach(function(c, ci){ if (c.id === nextCat) startAt = ci; });
        // Only look forward from the current time slot: pointing a 9 pm user back at "Breakfast" made no sense.
        var found = false;
        for (var si = startAt; si < MEAL_CATEGORIES.length; si++){
          var cand = MEAL_CATEGORIES[si].id;
          var ct = mealTarget(cand, 1);
          if (ct.cal <= 0) continue;
          var cg = totalsFor(dayMeals.filter(function(m){ return m.category === cand; }));
          if (ct.cal - cg.calories > 0){ nextCat = cand; found = true; break; }
        }
        noneAhead = !found;
      }
      heroLab = noneAhead ? 'ANYTIME' : 'NEXT UP';
      heroTitle = noneAhead ? Math.round(left).toLocaleString() + ' kcal left' : (CATEGORY_LABELS[nextCat] || 'Next meal');
      var tg = mealTarget(nextCat, 1);
      var got = totalsFor(dayMeals.filter(function(m){ return m.category === nextCat; }));
      var remK = tg.cal - got.calories, remP = tg.p - got.protein;
      if (noneAhead) heroTip = 'Add a snack, or log anything you missed earlier today.';
      else if (g.calories <= 0) heroTip = 'Log what you eat to see how your day adds up.';
      else if (tg.cal <= 0) heroTip = 'No target set for this meal. Change it in My plan.';
      else if (remK <= 0) heroTip = 'You\u2019ve covered your ' + heroTitle.toLowerCase() + ' target.';
      else heroTip = 'Aim for about ' + Math.round(remK / 10) * 10 + ' kcal' + (remP > 0 ? ' and ' + Math.round(remP) + 'g protein' : '') + '.';
    }
    var mc = function(l, v, gl){ return '<span class="mc">' + l + ' <b>' + Math.round(v) + '/' + gl + '</b></span>'; };

    var html = (signinNudgeHtml() || installBannerHtml()) +
      '<div class="log-top">' +
        '<div class="log-greet">' + greet + '</div>' +
        '<h2 class="log-headline"><span class="hl-num' + (overCal ? ' over' : '') + '">' + bigNum + '</span> kcal <em class="' + (overCal ? 'over' : '') + '">' + headWord + '</em></h2>' +
        '<div class="log-top-row">' +
          '<span class="log-chip">' + ROW_PLATE + dayMeals.length + (dayMeals.length === 1 ? ' meal ' : ' meals ') + (isToday ? 'today' : 'logged') + '</span>' +
          '<span class="log-top-nav">' +
            (!isToday ? '<button type="button" class="log-today-pill" data-action="set-log-day" data-day="' + todayKey() + '">Today</button>' : '') +
            '<button class="week-nav" data-action="log-day" data-dir="-1" aria-label="Previous day">' + chevL + '</button>' +
            '<button class="week-nav" data-action="log-day" data-dir="1" aria-label="Next day"' + (dayNext ? '' : ' disabled') + '>' + chevR + '</button>' +
          '</span>' +
        '</div>' +
      '</div>' +
      '<div class="log-hero-card' + (g.calories > 0 && left <= 0 && !overCal ? ' goal' : '') + '">' +
        '<div class="hero-ring">' + heroRingSvg(totals, g) + '</div>' +
        '<div class="lab">' + heroLab + '</div>' +
        '<h3>' + heroTitle + '</h3>' +
        '<p>' + heroTip + '</p>' +
        '<div class="hc-chips">' + mc('P', totals.protein, g.protein) + mc('C', totals.carbs, g.carbs) + mc('F', totals.fat, g.fat) + '</div>' +
        '<div class="hc-cta"><button type="button" class="hc-btn" data-action="set-tab" data-tab="scan">+ ADD MEAL</button>' +
          '<button type="button" class="hc-lnk" data-action="open-scanner" data-mode="photo">Scan food →</button></div>' +
      '</div>' +
      '<div class="log-tiles">' + waterTileHtml(viewKey) +
        '<button type="button" class="log-tile dash" data-action="open-food-search-overlay"><span class="lt-ic">' + STAR_SVG + '</span><b>FAVOURITES</b><small>Re-log in one tap</small></button>' +
      '</div>';

    if (dayMeals.length > 0){
      html += groupedMealsHtml(dayMeals);
    } else {
      var prev = null;
      STORE.meals.forEach(function(x){ if (dateKey(x.loggedAt) < viewKey && (!prev || x.loggedAt > prev.loggedAt)) prev = x; });
      var pl = prev ? formatDateLabel(dateKey(prev.loggedAt)) : '';
      html += '<div class="log-empty"><b>Nothing logged ' + (isToday ? 'yet' : 'this day') + '</b>' +
        '<span>Snap your plate or search a food.' + (isToday && prev ? '<br>' + (pl === 'Yesterday' ? 'Yesterday' : 'On ' + esc(pl)) + ' you had ' + esc(shortFoodName(tidyName(prev.name))) + ', ' + Math.round(prev.calories) + ' kcal.' : '') + '</span>' +
        (isToday && prev
          ? '<button type="button" data-action="copy-meal" data-id="' + prev.id + '">LOG IT AGAIN</button>'
          : '<button type="button" data-action="set-tab" data-tab="scan">ADD A MEAL</button>') +
      '</div>';
    }

    document.getElementById('view').innerHTML = html;
  }

  // Groups a list of meals into category sections (Breakfast, Morning
  // Snacks, Lunch, Evening Snacks, Dinner — in that fixed order) each
  // with its own header, calorie subtotal, and card of rows. Meals
  // logged before this feature existed have no category field, so
  // they land in a trailing "Other" bucket rather than being hidden
  // or crashing the grouping.
  function groupedMealsHtml(meals){
    var buckets = {};
    MEAL_CATEGORIES.forEach(function(c){ buckets[c.id] = []; });
    var other = [];
    meals.forEach(function(m){
      if (m.category && buckets[m.category]) buckets[m.category].push(m);
      else other.push(m);
    });

    var html = '';
    MEAL_CATEGORIES.forEach(function(c){
      if (buckets[c.id].length > 0) html += mealGroupHtml(c.id, c.label, buckets[c.id]);
    });
    if (other.length > 0) html += mealGroupHtml('other', 'Other', other);
    return html;
  }

  // One meal time on the Log tab: a header you can tap to fold the group
  // away (chevron, name, kcal — and a food count while it's folded), and
  // the rows underneath. Which groups are folded is remembered.
  function mealGroupHtml(id, label, group){
    var collapsed = !!(STORE.appSettings.collapsedMeals && STORE.appSettings.collapsedMeals[id]);
    var subtotal = totalsFor(group).calories;
    return '<button type="button" class="category-section-label cat-toggle" data-action="toggle-meal-group" data-category="' + id + '" aria-expanded="' + !collapsed + '">' +
        '<svg class="cat-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '<span class="cat-name">' + label + '</span>' +
        '<span class="cat-count">' + group.length + (group.length === 1 ? ' food' : ' foods') + '</span>' +
        '<span class="category-section-total">' + Math.round(subtotal).toLocaleString() + ' kcal</span>' +
      '</button>' +
      '<div class="acc meal-group' + (collapsed ? '' : ' open') + '"><div><div class="card flat">' + mealRowsHtml(group) +
        (id === 'other' ? '' : '<button type="button" class="add-to-cat" data-action="add-to-category" data-category="' + id + '"><span aria-hidden="true">+</span> Add to ' + esc(label.toLowerCase()) + '</button>') +
      '</div></div></div>';
  }

  // Foods that came from one photo (an AI scan logs each food on the plate
  // separately but with the same photo) show the picture once, as a small
  // header with the plate's total, and the foods listed under it.
  function mealRowsHtml(group){
    var byPhoto = {};
    group.forEach(function(m){ if (m.photoId && mealPhoto(m)) (byPhoto[m.photoId] = byPhoto[m.photoId] || []).push(m); });
    var done = {};
    return group.map(function(m){
      var items = m.photoId ? byPhoto[m.photoId] : null;
      if (!items || items.length < 2) return mealRowHtml(m);
      if (done[m.photoId]) return '';
      done[m.photoId] = true;
      var kcal = Math.round(totalsFor(items).calories).toLocaleString();
      return '<div class="photo-group">' +
        '<div class="pg-head"><img class="pg-thumb" src="' + mealPhoto(m) + '" alt="">' +
          '<div class="pg-meta"><b>Photo plate</b><span>' + items.length + ' foods \u00B7 ' + kcal + ' kcal</span></div></div>' +
        items.map(function(x){ return mealRowHtml(x, true); }).join('') +
      '</div>';
    }).join('');
  }

  // A newly logged food shouldn't disappear into a folded group.
  function expandMealGroup(categoryId){
    var cm = STORE.appSettings.collapsedMeals;
    if (cm && cm[categoryId || 'other']) delete cm[categoryId || 'other'];
  }

  function macroBarHtml(label, value, goal, cls, unit){
    unit = unit || 'g';
    var over = goal > 0 && value > goal;
    return '<div class="macro-bar-row">' +
      '<div class="macro-bar-label"><span>' + label + '</span><b>' + Math.round(value) + unit + ' / ' + goal + unit + '</b></div>' +
      '<div class="macro-bar-track"><div class="macro-bar-fill ' + cls + (over ? ' over' : '') + '" style="width:' + pct(value, goal) + '%"></div></div>' +
    '</div>';
  }

  // One row of the Insights "Today" table — plain consumed/goal/%
  // numbers, no bar, since this panel is meant to read as a quick
  // reference table rather than a repeat of the Log tab's bars.
  // Ring circumference is fixed (r=32), so the stroke-dasharray is
  // constant and only stroke-dashoffset moves to reveal the arc.
  // Fill offset stays capped at 100% (a ring can't physically show
  // more than a full circle), but the center text uses the real,
  // uncapped percentage — and switches to the "over" red once past
  // 100% — so exceeding a goal never just looks identical to hitting
  // it exactly.


  // Bigger hero ring above the macro rings, same technique but its
  // own radius/stroke and the accent gold color rather than a macro
  // color, so calories reads as the headline stat.



  // A one-line read on today's macros — calls out whichever macro is
  // furthest behind its own goal, or says so if all three are
  // tracking evenly. Recomputed fresh from today's actual totals on
  // every render, so it always reflects the current numbers rather
  // than being a static message.
  // A calorie-% floor before making any balance claim — at very low
  // intake (e.g. one small snack) every macro's % of goal is near
  // zero, so the spread looks tiny and reads as "balanced" even
  // though nothing meaningful has been logged yet. Below the floor,
  // say so instead of drawing a conclusion from too little data.


  var ROW_PLATE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/></svg>';
  var ROW_CHEV = '<svg class="mr-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  // Packaged-food names often arrive in ALL CAPS ("SPICY CHICKEN PIZZA"); show those in normal capitals.
  function tidyName(name){
    var n = String(name == null ? '' : name);
    if (!/[A-Z]/.test(n) || n !== n.toUpperCase()) return n;
    return n.toLowerCase().replace(/(^|[\s\-\/(])('?)([a-z])/g, function(_, a, b, c){ return a + b + c.toUpperCase(); }).replace(/\b(Mc)([a-z])/g, function(_, a, b){ return a + b.toUpperCase(); });
  }

  // The small picture on a Log row when there is no photo: the dish's own
  // icon if it has one, otherwise the food's emoji.
  function mealBadgeHtml(name){
    var ico = foodIcon(name);
    if (ico) return '<span class="meal-badge ico" aria-hidden="true"><img src="data/icons/' + ico + '.webp" alt="" loading="lazy" decoding="async"></span>';
    return '<span class="meal-badge emo" aria-hidden="true">' + foodEmoji(name) + '</span>';
  }

  function mealRowHtml(m, inPhotoGroup){
    var photo = inPhotoGroup === true ? '' : mealPhoto(m);
    return '<div class="mr-w"><div class="mr-del">Delete</div>' +
      '<div class="meal-row" data-action="edit-meal" data-id="' + m.id + '">' +
      (photo ? '<img class="meal-thumb" src="' + photo + '" alt="">' : mealBadgeHtml(m.name)) +
      '<div class="meal-row-name">' +
        '<div class="meal-row-name-text" title="' + esc(m.name) + '">' + esc(tidyName(m.name)) + '</div>' +
        '<div class="meal-row-macros"><span class="mm-p">P' + (m.protein||0) + '</span> · <span class="mm-c">C' + (m.carbs||0) + '</span> · <span class="mm-f">F' + (m.fat||0) + '</span></div>' +
      '</div>' +
      '<div class="meal-row-cal">' + m.calories + '</div>' +
      (dateKey(m.loggedAt) !== todayKey()
        ? '<button class="meal-row-copy" data-action="copy-meal" data-id="' + m.id + '" aria-label="Copy ' + esc(m.name) + ' to today">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"></path></svg>' +
          '</button>'
        : '') +
      ROW_CHEV +
    '</div></div>';
  }

  /* ---- Serving picker ----
     Every picked food gets a choice of how to measure it: its own
     serving (when the data has one — Kalori's "1 plate (550g)", Open
     Food Facts' serving size), household measures where USDA gives them
     ("cup, chopped"), and always plain grams and ounces. You pick the
     unit and how many; the calories/macros below rescale. Switching
     units keeps the amount the same (1 serving of 380 g becomes 380 g,
     then 13.4 oz). A per-serving food with no known weight (some Kalori
     items) can only be measured in multiples of its serving. */
  var OZ_GRAMS = 28.3495;

  // Sanity-check a food's numbers before it is logged. Food databases
  // (Open Food Facts especially) have gaps and typos: a missing protein /
  // carbs / fat field counts as 0, which quietly understates your totals,
  // and calories that don't roughly match the macros (4/4/9 kcal per gram)
  // usually mean a mistyped label. Returns a short warning, or ''.
  function foodDataNote(nut){
    if (!nut) return '';
    var missing = [];
    if (nut['proteins_100g'] == null) missing.push('protein');
    if (nut['carbohydrates_100g'] == null) missing.push('carbs');
    if (nut['fat_100g'] == null) missing.push('fat');
    if (missing.length) return 'This food has no ' + missing.join(' / ') + ' data, so it counts as 0 — your totals may come out low.';
    var kcal = nut['energy-kcal_100g'] || 0;
    var fromMacros = 4 * nut['proteins_100g'] + 4 * nut['carbohydrates_100g'] + 9 * nut['fat_100g'];
    if (kcal >= 60 && fromMacros > 0 && Math.abs(kcal - fromMacros) / kcal > 0.35){
      return 'Its calories (' + Math.round(kcal) + ') and macros (about ' + Math.round(fromMacros) + ' kcal worth) don\u2019t agree — worth checking the label.';
    }
    return '';
  }

  // "1 plate (550g)" / "(38 g)" / "250 g" -> grams, or null
  function parseServingGrams(text){
    var m = /\(\s*(\d+(?:\.\d+)?)\s*g(?:ram|rams|m)?\b/i.exec(text || '') ||
            /^\s*(\d+(?:\.\d+)?)\s*g(?:ram|rams|m)?\s*$/i.exec(text || '');
    return m ? parseFloat(m[1]) : null;
  }

  function servingUnitsFor(f){
    var units = [];
    var label = f.servingLabel || f.servingSizeText || '';
    if (f.servingGrams > 0){
      units.push({ id: 'serving', label: 'Serving' + (label ? ' · ' + label : ''), grams: f.servingGrams, step: 0.5, defaultQty: 1 });
    } else if (f.whole){
      units.push({ id: 'serving', label: 'Serving' + (label ? ' · ' + label : ''), grams: null, step: 0.5, defaultQty: 1 });
    }
    (f.measures || []).slice(0, 4).forEach(function(m, i){
      units.push({ id: 'm' + i, label: m.label + ' · ' + Math.round(m.grams) + ' g', grams: m.grams, step: 0.5, defaultQty: 1 });
    });
    if (f.per100g){
      units.push({ id: 'g', label: 'g', grams: 1, step: 10, defaultQty: 100 });
      units.push({ id: 'oz', label: 'oz', grams: OZ_GRAMS, step: 0.5, defaultQty: 1 });
    }
    return units;
  }

  function currentServingUnit(){
    var f = ui.selectedFood;
    if (!f) return null;
    var units = servingUnitsFor(f);
    for (var i = 0; i < units.length; i++) if (units[i].id === (ui.serving && ui.serving.unitId)) return units[i];
    return units[0];
  }

  // Start on the food's own serving if it has one, otherwise 100 g.
  function initServing(){
    var units = servingUnitsFor(ui.selectedFood);
    var u = units[0];
    if (u.id !== 'serving'){
      for (var i = 0; i < units.length; i++) if (units[i].id === 'g') u = units[i];
    }
    ui.serving = { unitId: u.id, qty: u.defaultQty };
    var ls = lastServAll()[lastServKey(ui.selectedFood.name)];
    if (ls && ls.q > 0 && isFinite(ls.q)){
      for (var j = 0; j < units.length; j++) if (units[j].id === ls.u){ ui.serving = { unitId: ls.u, qty: ls.q }; break; }
    }
  }

  function roundQty(n, unit){
    return unit && unit.id === 'g' ? Math.round(n) : Math.round(n * 100) / 100;
  }

  function servingEqText(){
    var u = currentServingUnit();
    if (!u || u.grams == null) return '';
    var grams = (ui.serving.qty || 0) * u.grams;
    if (u.id === 'g') return '= ' + (Math.round(grams / OZ_GRAMS * 10) / 10) + ' oz';
    return '= ' + (Math.round(grams * 10) / 10) + ' g';
  }

  function selectedFoodBannerHtml(){
    var f = ui.selectedFood;
    var units = servingUnitsFor(f);
    var cur = currentServingUnit();
    var from = f.from === 'Kalori' ? 'From Kalori' : (f.from === 'mine' ? 'From My Foods' : (f.from === 'saved' ? 'From your saved foods' : (f.from === 'builtin' ? 'Built-in food (estimate)' : 'From search')));
    var chips = units.length > 1
      ? '<div class="serving-label">Serving size</div><div class="serving-chips" role="group" aria-label="Serving size">' +
          units.map(function(u){
            return '<button type="button" class="serving-chip' + (u.id === cur.id ? ' active' : '') + '" data-action="set-serving-unit" data-unit="' + u.id + '">' + esc(u.label) + '</button>';
          }).join('') +
        '</div>'
      : '';
    return '<div class="selected-food-banner">' +
      '<div class="selected-food-banner-row">' +
        '<span class="banner-food">' + foodThumbHtml({ product_name: f.name, _image: f.image }, true) +
          '<span>' + from + ': <b>' + esc(f.name) + '</b>' + (f.brand ? ' (' + esc(f.brand) + ')' : '') + '</span></span>' +
      '</div>' +
      chips +
      (f.dataNote ? '<div class="food-note">\u26a0 ' + esc(f.dataNote) + '</div>' : '') +
      '<div class="serving-qty">' +
        '<span class="serving-label">Amount</span>' +
        '<button type="button" class="qty-btn" data-action="qty-step" data-dir="-1" aria-label="Less">&minus;</button>' +
        '<input type="number" id="servingQty" inputmode="decimal" step="any" min="0" value="' + roundQty(ui.serving.qty, cur) + '" aria-label="Amount">' +
        '<button type="button" class="qty-btn" data-action="qty-step" data-dir="1" aria-label="More">+</button>' +
        '<span class="serving-eq" id="servingEq">' + servingEqText() + '</span>' +
      '</div>' +
    '</div>';
  }

