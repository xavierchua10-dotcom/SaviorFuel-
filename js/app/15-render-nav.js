  // Scan tab: a small panel asking how you want to add the food. The
  // camera only opens after you pick one of the camera options — tapping
  // the tab itself never turns the camera on. Cancelling the camera
  // brings you back here.
  function renderScan(){
    var canBarcode = typeof BarcodeDetector !== 'undefined';
    var svgOpen = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    var icons = {
      barcode: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h6v2.4H5.4V9H3z"/><path d="M15 3h6v6h-2.4V5.4H15z"/><path d="M3 15h2.4v3.6H9V21H3z"/><path d="M18.6 15H21v6h-6v-2.4h3.6z"/><rect x="6.5" y="11" width="11" height="2" rx="1"/></svg>',
      camera: svgOpen + '<path d="M4 8V6a2 2 0 0 1 2-2h1l1.5-2h7L17 4h1a2 2 0 0 1 2 2v2"></path><path d="M2 8h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"></path><circle cx="12" cy="14" r="4"></circle></svg>',
      search: svgOpen + '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>'
    };
    var chevron = '<svg class="scan-option-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    function option(action, mode, icon, title, sub, disabled){
      return '<button type="button" class="scan-option" data-action="' + action + '"' + (mode ? ' data-mode="' + mode + '"' : '') + (disabled ? ' disabled' : '') + '>' +
        '<span class="scan-option-icon">' + icon + '</span>' +
        '<span class="scan-option-text"><span class="scan-option-title">' + title + '</span><span class="scan-option-sub">' + sub + '</span></span>' +
        chevron +
      '</button>';
    }
    var photoSub = aiScanEnabled() ? 'Point at your plate and the AI lists what\'s on it.' : 'Take a photo of your meal to get a starting guess';
    var left = aiScanEnabled() ? aiLeftGet() : null;
    var leftLine = !aiScanEnabled() ? '' :
      aiLeftPillHtml(left);
    function tile(action, mode, icon, title, sub, disabled){
      return '<button type="button" class="scan-option scan-tile" data-action="' + action + '"' + (mode ? ' data-mode="' + mode + '"' : '') + (disabled ? ' disabled' : '') + '>' +
        '<span class="scan-option-icon">' + icon + '</span>' +
        '<span class="scan-option-text"><span class="scan-option-title">' + title + '</span><span class="scan-option-sub">' + sub + '</span></span>' +
      '</button>';
    }
    // Last few different foods you've logged — one tap to log one again today.
    var seen = {}, recent = [];
    STORE.meals.slice().sort(function(x, y){ return y.loggedAt - x.loggedAt; }).forEach(function(m){
      var k = String(m.name || '').toLowerCase();
      if (!k || seen[k] || recent.length >= 5) return;
      seen[k] = 1; recent.push(m);
    });
    var recentHtml = recent.length ? (
      '<div class="scan-recent-label">Recent</div><div class="scan-recent">' +
        recent.map(function(m){
          return '<button type="button" class="scan-chip" data-action="open-recent-sheet" data-id="' + m.id + '">' + esc(shortFoodName(tidyName(m.name))) + '<span>' + Math.round(m.calories) + ' kcal</span></button>';
        }).join('') +
      '</div>') : '';
    document.getElementById('view').innerHTML =
      '<div class="scan-page">' +
        '<button type="button" class="meal-banner" data-action="change-add-meal" aria-label="Adding food to ' + esc(CATEGORY_LABELS[addCategoryNow()] || 'Meal') + '. Change meal">' +
          '<span class="mb-ic">' + (CATEGORY_EMOJI[addCategoryNow()] || '\ud83c\udf7d\ufe0f') + '</span>' +
          '<span class="mb-tx"><small>Adding to</small><b>' + esc(CATEGORY_LABELS[addCategoryNow()] || 'Meal') + '</b></span>' +
          '<span class="mb-chg">Change \u25be</span>' +
        '</button>' +
        '<button type="button" class="scan-option scan-hero" data-action="open-scanner" data-mode="photo">' +
          '<span class="scan-option-icon">' + icons.camera + '</span>' +
          '<span class="scan-option-text"><span class="scan-option-title">Snap your meal</span><span class="scan-option-sub">' + photoSub + '</span>' + leftLine + '</span>' +
        '</button>' +
        '<div class="scan-tiles">' +
          tile('open-scanner', 'barcode', icons.barcode, 'Barcode', canBarcode ? 'Packaged food' : 'Not supported here', !canBarcode) +
          tile('open-food-search-overlay', '', icons.search, 'Search', 'Type the name') +
        '</div>' +
        recentHtml +
      '</div>';
  }


  function tabIndexOf(tab){
    var btns = document.querySelectorAll('.tabbar button');
    for (var i = 0; i < btns.length; i++) if (btns[i].dataset.tab === tab) return i;
    return 0;
  }

  /* =========================================================
     A meal lands on the Log ring: whenever today's calories go up
     while the Log tab is showing today, the number counts up, the
     rings grow from where they were, a +kcal floats up and the ring
     pops. Crossing the daily goal for the first time adds a pulse and
     a burst of dots. Works from any way of logging (it just watches
     the totals), and is skipped for reduced motion.
     ========================================================= */
  var heroSeen = null, heroAnimToken = 0;
  function heroLanded(){
    if (state.tab !== 'log') return;
    var tk = todayKey();
    if (logDayKey() !== tk) return;
    var g = STORE.goals;
    var t = totalsFor(mealsForDay(tk));
    var now = { key: tk, cal: t.calories, protein: t.protein, carbs: t.carbs, fat: t.fat };
    var prev = heroSeen; heroSeen = now;
    if (!prev || prev.key !== tk || now.cal <= prev.cal + 0.5 || prefersReducedMotion()) return;
    var ring = document.querySelector('.hero-ring');
    if (!ring || !ring.animate) return;
    var token = ++heroAnimToken;
    var hostEl = ring.closest('.log-hero, .log-hero-card') || ring;
    var numEl = hostEl.querySelector('.hero-ring-num'), subEl = hostEl.querySelector('.hero-ring-sub');
    var goalsBy = { cal: g.calories, protein: g.protein, carbs: g.carbs, fat: g.fat };
    var valsPrev = { cal: prev.cal, protein: prev.protein, carbs: prev.carbs, fat: prev.fat };
    var valsNow = { cal: now.cal, protein: now.protein, carbs: now.carbs, fat: now.fat };
    function frac(id, v){ return goalsBy[id] > 0 ? Math.min(v / goalsBy[id], 1) : 0; }
    function paintNum(v){
      if (!numEl || !numEl.isConnected) return;
      var left = g.calories - v, over = g.calories > 0 && v > g.calories;
      numEl.textContent = (g.calories > 0 ? Math.abs(Math.round(left)) : Math.round(v)).toLocaleString();
      numEl.classList.toggle('over', over);
      if (subEl) subEl.textContent = g.calories > 0 ? (over ? 'kcal over' : 'kcal left \u00B7 ' + Math.round(v).toLocaleString() + ' eaten') : 'kcal eaten';
    }
    // 1) draw the "before" picture right away
    paintNum(prev.cal);
    var circles = {};
    HERO_RINGS.forEach(function(rg){
      var el = ring.querySelector('.ring-' + rg.id);
      if (!el) return;
      var c = 2 * Math.PI * rg.r;
      circles[rg.id] = { el: el, c: c };
      el.style.transition = 'none';
      el.style.strokeDashoffset = (c * (1 - frac(rg.id, valsPrev[rg.id]))).toFixed(2);
    });
    var finalData = null;
    var has3d = ring3d.state === 'ready' && ring3dData && ring.classList.contains('is3d');
    function set3d(k){   // k = 0..1 progress from "before" to "after"
      var d = {};
      HERO_RINGS.forEach(function(rg){
        var a = frac(rg.id, valsPrev[rg.id]), b = frac(rg.id, valsNow[rg.id]);
        var f = a + (b - a) * k;
        d[rg.id] = { frac: f, over: k >= 1 && finalData[rg.id].over };
      });
      ring3dData = d;
      ring3dBuild();
    }
    if (has3d){
      finalData = {}; Object.keys(ring3dData).forEach(function(id){ finalData[id] = ring3dData[id]; });
      set3d(0);
    }
    // 2) after the sheet has finished closing, grow everything
    setTimeout(function(){
      if (token !== heroAnimToken || !ring.isConnected) return;
      void ring.offsetWidth;
      HERO_RINGS.forEach(function(rg){
        var cc = circles[rg.id];
        if (!cc) return;
        cc.el.style.transition = 'stroke-dashoffset 800ms cubic-bezier(.2,.8,.2,1)';
        cc.el.style.strokeDashoffset = (cc.c * (1 - frac(rg.id, valsNow[rg.id]))).toFixed(2);
      });
      var plus = document.createElement('div');
      plus.className = 'hero-plus';
      plus.textContent = '+' + Math.round(now.cal - prev.cal).toLocaleString();
      ring.appendChild(plus);
      plus.animate([
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(-4px)', offset: .25 },
        { opacity: 1, transform: 'translateY(-26px)', offset: .7 },
        { opacity: 0, transform: 'translateY(-44px)' }
      ], { duration: 1200, easing: 'ease-out' }).onfinish = function(){ plus.remove(); };
      var DUR = 800, t0 = performance.now(), lastBuild = 0;
      function ease(x){ return 1 - Math.pow(1 - x, 3); }
      (function step(ts){
        if (token !== heroAnimToken || !ring.isConnected) return;
        var x = Math.min(1, (ts - t0) / DUR), k = ease(x);
        paintNum(valsPrev.cal + (valsNow.cal - valsPrev.cal) * k);
        if (has3d && ts - lastBuild > 70 && x < 1){ lastBuild = ts; set3d(k); }
        if (x < 1){ requestAnimationFrame(step); return; }
        paintNum(valsNow.cal);
        if (has3d) set3d(1);
        finishPop();
      })(t0);
    }, 380);
    function finishPop(){
      if (!ring.isConnected) return;
      var crossed = g.calories > 0 && prev.cal < g.calories && now.cal >= g.calories;
      ring.animate([{ scale: '1' }, { scale: crossed ? '1.1' : '1.05', offset: .4 }, { scale: '.98', offset: .7 }, { scale: '1' }], { duration: 480, easing: 'ease-out' });
      if (!crossed) return;
      var pulse = document.createElement('div');
      pulse.className = 'hero-pulse';
      ring.appendChild(pulse);
      pulse.animate([{ opacity: .8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 700, easing: 'ease-out' }).onfinish = function(){ pulse.remove(); };
      var cols = ['#a6e36b', '#f5c451', '#ff8a65', '#a6e36b', '#f5c451', '#ff8a65', '#a6e36b', '#f5c451'];
      var rad = (ring.clientWidth || 250) * 0.62;
      cols.forEach(function(col, i){
        var d = document.createElement('span');
        d.className = 'hero-dot'; d.style.background = col;
        ring.appendChild(d);
        var a = i / cols.length * 2 * Math.PI;
        d.animate([
          { opacity: 1, transform: 'translate(0,0) scale(1)' },
          { opacity: 0, transform: 'translate(' + (Math.cos(a) * rad).toFixed(1) + 'px,' + (Math.sin(a) * rad).toFixed(1) + 'px) scale(.4)' }
        ], { duration: 750, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = function(){ d.remove(); };
      });
    }
  }

  function renderApp(){
    // The 3D panel only exists on Insights > Daily Overview; stop its
    // render loop everywhere else so it isn't drawing off-screen.
    var onInsights = state.tab === 'insights' && STORE.meals.length > 0;
    if (!onInsights) Model3D.unmount();
    document.getElementById('view').classList.remove('model-fullscreen');
    document.getElementById('view').classList.toggle('plain-fullscreen', onInsights);
    document.querySelectorAll('.tabbar button').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.tab === state.tab);
    });
    if (state.tab === 'log') renderLog();
    else if (state.tab === 'history') renderHistory();
    else if (state.tab === 'scan') renderScan();
    else if (state.tab === 'insights') renderInsights();
    else if (state.tab === 'settings') renderSettings();

    refreshDayOverlay();
    mountHeroRing3d();
    heroLanded();
    updateTopStreak();
  }

  // Header pill: current logging streak (flame + days). Tap opens Insights.
  var FLAME_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.6 2.2c.3 2.6-.8 4.2-2.2 5.8-1.5 1.7-3.2 3.5-3.2 6.5A5.8 5.8 0 0 0 13 20a5.8 5.8 0 0 0 5-5.7c0-2.2-1-3.8-2-5.1-.3 1.1-.9 1.9-1.8 2.3.5-3.6-.1-7.4-1.6-9.3z"/></svg>';
  function updateTopStreak(){
    var el = document.getElementById('topStreak');
    if (!el) return;
    var n = streakInfo(dayStatsMap()).current;
    el.classList.toggle('off', n === 0);
    var ms = n >= 7 && (n % 7 === 0 || n === 30 || n === 50 || n === 100 || n === 365);
    var msTxt = !ms ? '' : n === 30 ? '1 month!' : n % 7 === 0 ? (n / 7 === 1 ? '1 week!' : (n / 7) + ' weeks!') : n + '!';
    el.classList.toggle('ms', ms);
    el.innerHTML = FLAME_SVG + '<span>' + n + '</span><small>' + (n === 1 ? 'day' : 'days') + '</small>' + (ms ? '<em class="streak-ms">' + msTxt + '</em>' : '');
    el.setAttribute('aria-label', n === 0 ? 'No logging streak yet' : n + ' day logging streak');
  }



  // Tab switch = both pages slide sideways together, like SaviorFit Logger's
  // switchTabWithFade: the page being left is lifted into a "ghost" pane laid
  // over #view and slides out; the new page is drawn into #view and slides in
  // from the other side. #app clips the overflow. The direction follows the
  // tab order (new tab to the right = slide left).
  var TAB_SLIDE_MS = 300, TAB_SLIDE_EASE = 'cubic-bezier(.32,.72,0,1)';
  var tabSlide = null; // { ghost, anims, timer } while a slide is running
  function endTabSlide(){
    if (!tabSlide) return;
    var t = tabSlide; tabSlide = null;
    clearTimeout(t.timer);
    try { t.anims.forEach(function(a){ a.cancel(); }); } catch (e) {}
    if (t.ghost.parentNode) t.ghost.parentNode.removeChild(t.ghost);
  }

  function switchTab(newTab){
    if (newTab === state.tab) return;
    var oldIndex = tabIndexOf(state.tab), newIndex = tabIndexOf(newTab);
    if (state.tab === 'scan') ui.addCategory = null;   // leaving the Add page: forget which meal it was for
    closeScanner(); // safety: release the camera if it was somehow left open
    closeDayOverlay();
    closeFoodSearchOverlay();
    closeAddMealOverlay();
    endTabSlide(); // a tap mid-slide finishes the running one first
    var viewEl = document.getElementById('view');
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion){
      state.tab = newTab;
      renderApp();
      return;
    }

    if (typeof viewEl.animate !== 'function'){
      state.tab = newTab;
      renderApp();
      return;
    }
    var dir = newIndex > oldIndex ? 1 : -1;
    // The 3D pyramid's canvas can't be lifted into a ghost pane, so leaving it
    // is a two-step slide (as in SaviorFit Logger's Insight tab): the live page
    // slides fully out, the new one is drawn while it's out of sight, then
    // slides in from the other side.
    var leaving3D = state.tab === 'insights' && STORE.meals.length > 0;
    if (leaving3D){
      var w = viewEl.getBoundingClientRect().width;
      var outAnim = viewEl.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * w) + 'px)' }],
        { duration: 150, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      tabSlide = { ghost: document.createElement('i'), anims: [outAnim], timer: 0 };
      outAnim.onfinish = function(){
        outAnim.onfinish = null;
        state.tab = newTab;
        renderApp();
        viewEl.scrollTop = 0;
        outAnim.cancel();
        var inAnim = viewEl.animate([{ transform: 'translateX(' + (dir * w) + 'px)' }, { transform: 'translateX(0)' }],
          { duration: 220, easing: TAB_SLIDE_EASE, fill: 'both' });
        tabSlide = { ghost: document.createElement('i'), anims: [inAnim], timer: 0 };
        tabSlide.timer = setTimeout(endTabSlide, 250);
      };
      return;
    }
    var appEl = document.getElementById('app');
    var ar = appEl.getBoundingClientRect(), vr = viewEl.getBoundingClientRect();
    var ghost = document.createElement('main');
    ghost.id = 'view'; // same id so the #view styles still apply to what's inside
    ghost.className = viewEl.className + ' view-ghost';
    ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('inert', '');
    var oldScroll = viewEl.scrollTop;
    while (viewEl.firstChild) ghost.appendChild(viewEl.firstChild);
    ghost.style.top = (vr.top - ar.top) + 'px'; ghost.style.left = (vr.left - ar.left) + 'px';
    ghost.style.width = vr.width + 'px'; ghost.style.height = vr.height + 'px';
    appEl.appendChild(ghost);
    ghost.scrollTop = oldScroll;

    viewEl.scrollTop = 0;
    state.tab = newTab;
    renderApp(); // draws the new page into the real #view (first #view in the document)
    viewEl.scrollTop = 0;

    var opts = { duration: TAB_SLIDE_MS, easing: TAB_SLIDE_EASE, fill: 'both' };
    var a1 = ghost.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * vr.width) + 'px)' }], opts);
    var a2 = viewEl.animate([{ transform: 'translateX(' + (dir * vr.width) + 'px)' }, { transform: 'translateX(0)' }], opts);
    tabSlide = { ghost: ghost, anims: [a1, a2], timer: 0 };
    tabSlide.timer = setTimeout(endTabSlide, TAB_SLIDE_MS + 30);
  }


  // Swipe a food row left to delete it (asks first, like the trash used to).
  (function(){
    var row = null, sx = 0, sy = 0, dx = 0, lock = 0;
    document.addEventListener('touchstart', function(e){
      var r = e.target.closest && e.target.closest('.mr-w .meal-row');
      if (!r || e.touches.length !== 1){ row = null; return; }
      row = r; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; lock = 0; r.style.transition = 'none';
    }, { passive: true });
    document.addEventListener('touchmove', function(e){
      if (!row) return;
      var x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
      if (!lock && (Math.abs(x) > 8 || Math.abs(y) > 8)) lock = Math.abs(x) > Math.abs(y) ? 1 : 2;
      if (lock !== 1) return;
      dx = Math.min(0, x);
      if (row.previousElementSibling) row.previousElementSibling.style.opacity = '1';
      row.style.transform = 'translateX(' + Math.max(dx, -120) + 'px)';
    }, { passive: true });
    function end(){
      if (!row) return;
      var r = row; row = null;
      r.style.transition = 'transform .2s ease'; r.style.transform = '';
      var dl = r.previousElementSibling; if (dl) setTimeout(function(){ dl.style.opacity = ''; }, 220);
      if (lock === 1){
        ui.swipeAt = Date.now();
        if (dx < -90) requestDeleteMeal(r.getAttribute('data-id'));
      }
    }
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
  })();

  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;
    if (action === 'set-tab'){
      switchTab(el.dataset.tab);
    } else if (action === 'add-to-category'){
      ui.addCategory = el.dataset.category;
      switchTab('scan');
    } else if (action === 'add-meal'){
      addMealFromForm();
    } else if (action === 'close-add-meal-overlay'){
      closeAddMealOverlay();
    } else if (action === 'show-nutrient-info'){
      showNutrientInfo();
    } else if (action === 'close-nutrient-info'){
      closeNutrientInfo();
    } else if (action === 'edit-meal'){
      if (Date.now() - (ui.swipeAt || 0) < 450) return;   // that was a swipe, not a tap
      openEditMeal(el.dataset.id);
    } else if (action === 'delete-editing-meal'){
      var delId = ui.editingMealId;
      closeAddMealOverlay();
      if (delId) requestDeleteMeal(delId);
    } else if (action === 'toggle-day-picker'){
      toggleAccordion('dayRow', 'dayAcc');
    } else if (action === 'set-meal-day'){
      setMealDay(parseInt(el.dataset.days, 10));
    } else if (action === 'toggle-category-picker'){
      toggleAccordion('mealTimeRow', 'categoryAcc');
    } else if (action === 'toggle-meal-group'){
      var groupBody = el.nextElementSibling;
      if (groupBody){
        var nowOpen = !groupBody.classList.contains('open');
        groupBody.classList.toggle('open', nowOpen);
        el.setAttribute('aria-expanded', String(nowOpen));
        var folded = STORE.appSettings.collapsedMeals || (STORE.appSettings.collapsedMeals = {});
        if (nowOpen) delete folded[el.dataset.category]; else folded[el.dataset.category] = true;
        saveStore();
      }
    } else if (action === 'show-more-nutrition'){
      document.getElementById('moreNutriRow').classList.remove('hidden');
      el.classList.add('hidden');
    } else if (action === 'toggle-nutrition-fields'){
      toggleAccordion('nutriRow', 'nutriAcc');
    } else if (action === 'select-meal-category'){
      ui.selectedCategory = el.dataset.category;
      renderCategoryPicker();
      setAccordion('mealTimeRow', 'categoryAcc', false); // picked one — fold the pills away again
    } else if (action === 'open-food-photo'){
      openFoodPhoto();
    } else if (action === 'close-food-photo'){
      closeFoodPhoto();
    } else if (action === 'close-ai-scan'){
      closeAiScanSheet();
    } else if (action === 'toggle-ai-category'){
      toggleAccordion('aiMealRow', 'aiCategoryAcc');
    } else if (action === 'ai-select-category'){
      aiScan.category = el.dataset.category;
      renderAiCategoryPicker();
      setAccordion('aiMealRow', 'aiCategoryAcc', false);
    } else if (action === 'ai-scale'){
      var sit = aiScan.items[parseInt(el.dataset.i, 10)];
      if (sit){
        sit.grams = Math.max(1, Math.round(sit.base.grams * parseFloat(el.dataset.f)));
        renderAiScanItems();
      }
    } else if (action === 'remove-meal-photo'){
      removeMealPhoto();
    } else if (action === 'open-sign-in'){
      openSignIn(false);
    } else if (action === 'open-account'){
      openAccount();
    } else if (action === 'ai-step'){
      var stit = aiScan.items[parseInt(el.dataset.i, 10)];
      if (stit){
        stit.grams = Math.min(3000, Math.max(1, Math.round(stit.grams + parseInt(el.dataset.d, 10) * aiStep(stit))));
        renderAiScanItems();
      }
    } else if (action === 'ai-add-item'){
      aiScan.items.push({ name: '', grams: 100, manual: true, base: { grams: 100, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 } });
      renderAiScanItems();
      var nm = document.querySelectorAll('#aiScanItems .ai-item-name');
      if (nm.length) nm[nm.length - 1].focus();
    } else if (action === 'ai-remove-item'){
      aiScan.items.splice(parseInt(el.dataset.i, 10), 1);
      if (aiScan.items.length === 0) closeAiScanSheet(); else renderAiScanItems();
    } else if (action === 'ai-scan-log'){
      logAiScan();
    } else if (action === 'delete-meal'){
      requestDeleteMeal(el.dataset.id);
    } else if (action === 'confirm-yes'){
      confirmYes();
    } else if (action === 'cancel-confirm'){
      closeConfirmSheet();
    } else if (action === 'open-day'){
      openDayOverlay(el.dataset.day);
    } else if (action === 'close-day'){
      closeDayOverlay();
    } else if (action === 'day-meal-menu'){
      e.stopPropagation();
      openMealMenu(el.dataset.id);
    } else if (action === 'close-meal-menu'){
      closeMealMenu();
    } else if (action === 'menu-edit'){
      closeMealMenu();
      openEditMeal(el.dataset.id);
    } else if (action === 'menu-copy'){
      closeMealMenu();
      copyMealToToday(el.dataset.id);
    } else if (action === 'menu-delete'){
      closeMealMenu();
      requestDeleteMeal(el.dataset.id);
    } else if (action === 'toggle-settings-sec' || action === 'open-settings-sec'){
      var sec = el.dataset.sec;
      ui.settingsOpen = (action === 'toggle-settings-sec' && ui.settingsOpen === sec) ? null : sec;
      renderApp();
      var secEl = document.getElementById('setc-' + sec);
      if (secEl && ui.settingsOpen === sec) secEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (action === 'share-profile'){
      shareProfile();
    } else if (action === 'share-week'){
      shareWeek();
    } else if (action === 'edit-profile-name'){
      editProfileName();
    } else if (action === 'edit-weight'){
      editWeight();
    } else if (action === 'open-quick-add'){
      openFoodSheet('quick');
    } else if (action === 'open-my-food'){
      openFoodSheet('mine');
    } else if (action === 'edit-my-food'){
      openFoodSheet('mine', el.dataset.id);
    } else if (action === 'save-food-sheet'){
      saveFoodSheet(el.dataset.mode, el.dataset.id);
    } else if (action === 'delete-my-food'){
      deleteMyFood(el.dataset.id);
    } else if (action === 'close-food-sheet'){
      closeFoodSheet();
    } else if (action === 'clear-food-search'){
      var fsi = document.getElementById('foodSearchInput');
      fsi.value = '';
      searchFoodDebounced('');
      fsi.focus();
    } else if (action === 'water-add'){
      addWater(parseInt(el.dataset.ml, 10) || 0);
    } else if (action === 'toggle-hist-find'){
      var wasOpen = !!(ui.histFind || (ui.histQuery || '').trim());
      ui.histFind = !wasOpen;
      if (wasOpen) ui.histQuery = '';
      renderHistory();
      if (!wasOpen){ var hs = document.getElementById('histSearch'); if (hs) hs.focus(); }
    } else if (action === 'open-calendar'){
      ui.histMonth = null;
      openCalendarSheet();
    } else if (action === 'close-calendar'){
      closeCalendarSheet();
    } else if (action === 'cal-month'){
      ui.histMonth = addMonthKey(historyMonthKey(), parseInt(el.dataset.dir, 10));
      var calEl = document.getElementById('calSheet');
      if (calEl) calEl.innerHTML = calendarSheetInner();
    } else if (action === 'history-more'){
      ui.histShow = (ui.histShow || 21) + 21;
      renderApp();
    } else if (action === 'history-pick-day'){
      closeCalendarSheet();
      openDayOverlay(el.dataset.day);
    } else if (action === 'copy-day'){
      copyDayToToday(el.dataset.day);
      closeDayOverlay();
    } else if (action === 'clear-data'){
      openConfirmSheet({
        title: 'Erase everything?',
        note: sync.user ? 'All logged meals are removed and your goals reset. Because you\u2019re signed in, this also erases your online backup. This can\u2019t be undone.' : 'All logged meals are removed and your goals reset. This can\u2019t be undone.',
        confirmLabel: 'Erase everything',
        onConfirm: function(){
          makeSafetyCopy('before erase');
          STORE = { meals: [], goals: Object.assign({}, DEFAULT_GOALS), profile: Object.assign({}, DEFAULT_PROFILE), appSettings: Object.assign({}, DEFAULT_APP_SETTINGS), savedFoods: [], myFoods: [], water: {}, weights: {} };
          saveStore();
          applyAppearanceSettings();
          renderApp();
        }
      });
    } else if (action === 'pick-food'){
      pickFoodResult(parseInt(el.dataset.index, 10));
    } else if (action === 'open-food-search-overlay'){
      openFoodSearchOverlay();
    } else if (action === 'ai-pick-match'){
      openAiMatchPicker(parseInt(el.dataset.i, 10));
    } else if (action === 'ai-match-close'){
      closeAiMatchPicker();
    } else if (action === 'ai-match-choose'){
      var mi = parseInt(el.dataset.i, 10), mit = aiScan.items[mi];
      if (mit){
        if (el.dataset.k === 'ai') aiUseEstimate(mit);
        else { var mp = (mit.cands || [])[parseInt(el.dataset.k, 10)]; if (mp) aiApplyMatch(mit, mp); }
        aiRefreshItem(mi);
      }
      closeAiMatchPicker();
    } else if (action === 'ai-match-search'){
      var msi = el.dataset.i;
      closeAiMatchPicker();
      var tmp = document.createElement('button'); tmp.dataset.action = 'ai-search-instead'; tmp.dataset.i = msi;
      document.body.appendChild(tmp); tmp.click(); tmp.remove();
    } else if (action === 'ai-search-instead'){
      var si = parseInt(el.dataset.i, 10);
      var sit2 = aiScan.items[si];
      if (sit2){
        openFoodSearchOverlay();
        ui.replaceAiIdx = si;                 // set after open: opening starts from a clean state
        document.getElementById('foodSearchOverlay').classList.add('over-ai');
        var sq = String(sit2.name || '').trim();
        if (sq.length >= 2){
          document.getElementById('foodSearchInput').value = sq;
          runFoodSearch(sq);
        }
      }
    } else if (action === 'use-custom-food-name' && ui.replaceAiIdx != null){
      var rit = aiScan.items[ui.replaceAiIdx];
      if (rit) rit.name = String(el.dataset.name || '').slice(0, 60);
      closeFoodSearchOverlay();
      renderAiScanItems();
      showToast('Renamed');
    } else if (action === 'use-custom-food-name'){
      ui.prefillName = el.dataset.name;
      ui.prefillCal = ui.prefillProtein = ui.prefillCarbs = ui.prefillFat = null;
      ui.selectedFood = null;
      ui.justFilledFood = false; // no real macro data was filled in, just the name — no glow needed
      closeFoodSearchOverlay();
      openAddMealOverlay();
    } else if (action === 'close-food-search-overlay'){
      closeFoodSearchOverlay();
    } else if (action === 'install-app'){
      installApp();
    } else if (action === 'dismiss-signin-nudge'){
      STORE.appSettings.signinNudgeDismissed = true;
      saveStore();
      renderApp();
    } else if (action === 'dismiss-install'){
      STORE.appSettings.installDismissed = true;
      saveStore();
      renderApp();
    } else if (action === 'close-install-help'){
      var ih = document.getElementById('installHelp'); if (ih) ih.remove();
    } else if (action === 'copy-meal'){
      copyMealToToday(el.dataset.id);
    } else if (action === 'open-recent-sheet'){
      openRecentSheet(el.dataset.id);
    } else if (action === 'close-recent-sheet'){
      closeRecentSheet();
    } else if (action === 'recent-select-category'){
      recentSheet.category = el.dataset.category;
      Array.prototype.forEach.call(document.querySelectorAll('#recentCats .category-pill'), function(b){
        b.classList.toggle('active', b.getAttribute('data-category') === recentSheet.category);
      });
    } else if (action === 'recent-log'){
      var rid = recentSheet.id, rcat = recentSheet.category;
      closeRecentSheet();
      if (rid) copyMealToToday(rid, rcat);
    } else if (action === 'toggle-fav'){
      toggleFavorite(el.dataset.name);
    } else if (action === 'set-log-day'){
      ui.logDay = el.dataset.day;
      renderApp();
    } else if (action === 'log-day'){
      var dirD = Number(el.dataset.dir) || 0;
      var shiftedD = addDaysKey(logDayKey(), dirD);
      ui.logDay = shiftedD > todayKey() ? todayKey() : shiftedD;
      renderApp();
    } else if (action === 'log-week'){
      var dirW = Number(el.dataset.dir) || 0;
      var shifted = addDaysKey(logDayKey(), dirW * 7);
      ui.logDay = shifted > todayKey() ? todayKey() : shifted;
      renderApp();
    } else if (action === 'calculate-plan'){
      calculatePlanFromForm();
    } else if (action === 'open-scanner'){
      openScanner(el.dataset.mode);
    } else if (action === 'capture-food-photo'){
      captureFoodPhoto();
    } else if (action === 'set-serving-unit'){
      setServingUnit(el.dataset.unit);
    } else if (action === 'qty-step'){
      var stepUnit = currentServingUnit();
      if (stepUnit){
        var nextQty = roundQty((ui.serving.qty || 0) + parseInt(el.dataset.dir, 10) * stepUnit.step, stepUnit);
        setServingQty(nextQty);
        var qtyInput = document.getElementById('servingQty');
        if (qtyInput) qtyInput.value = roundQty(ui.serving.qty, stepUnit);
      }
    } else if (action === 'close-scanner'){
      closeScanner();
    } else if (action === 'toggle-torch'){
      toggleTorch();
    } else if (action === 'pick-scan-photo'){
      document.getElementById('scanFile').click();
    } else if (action === 'set-unit'){
      if (document.getElementById('profWeight')){ var pr = readProfileForm(); if (!pr.err) STORE.profile = pr.profile; }
      STORE.appSettings.unit = el.dataset.unit;
      saveStore();
      renderApp();
    } else if (action === 'toggle-haptic'){
      STORE.appSettings.haptic = (el.dataset.val === 'on');
      saveStore();
      renderApp();
    } else if (action === 'set-theme'){
      STORE.appSettings.theme = el.dataset.theme;
      saveStore();
      applyAppearanceSettings();
      renderApp();
    } else if (action === 'set-dark-style'){
      STORE.appSettings.darkStyle = el.dataset.val === 'glow' ? 'glow' : 'classic';
      saveStore();
      applyAppearanceSettings();
      renderApp();
    } else if (action === 'set-light-style'){
      STORE.appSettings.lightStyle = el.dataset.val;
      saveStore();
      applyAppearanceSettings();
      renderApp();
    } else if (action === 'toggle-danger-zone'){
      ui.dangerZoneOpen = !ui.dangerZoneOpen;
      renderApp();
    } else if (action === 'meal-split-step' || action === 'meal-split-reset'){
      if (action === 'meal-split-reset') delete STORE.appSettings.mealSplit;
      else {
        var cur = mealSplitPcts(), sid = el.dataset.id;
        if (cur[sid] == null) return;
        cur[sid] = Math.max(0, Math.min(100, cur[sid] + (parseInt(el.dataset.d, 10) || 0)));
        STORE.appSettings.mealSplit = cur;
      }
      saveStore();
      var msb = document.getElementById('mealSplitBox');
      if (msb) msb.outerHTML = mealSplitBoxHtml();
    } else if (action === 'meal-split-range'){
      ui.mealSplit = el.dataset.range === 'week' ? 'week' : 'today';
      var msc = document.getElementById('mealSplitCard');
      if (msc) msc.outerHTML = mealSplitCardHtml();
    } else if (action === 'toggle-backups'){
      ui.backupsOpen = !ui.backupsOpen;
      renderApp();
    } else if (action === 'restore-backup'){
      restoreSafetyCopy(parseInt(el.dataset.i, 10));
    } else if (action === 'share-app'){
      shareApp();
    } else if (action === 'export-data'){
      exportData();
    } else if (action === 'import-data'){
      document.getElementById('importFile').click();
    }
  });

  // Live food search as you type (debounced inside searchFoodDebounced).
  document.addEventListener('input', function(e){
    if (e.target.id === 'foodSearchInput'){
      searchFoodDebounced(e.target.value);
    } else if (e.target.id === 'histSearch'){
      ui.histQuery = e.target.value;
      var hl = document.getElementById('histList');
      if (hl) hl.innerHTML = historyListHtml(dayStatsMap(), STORE.goals.calories);
    }
  });

  // Rows that act as buttons also work from a keyboard / screen reader.
  document.addEventListener('keydown', function(e){
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute && e.target.getAttribute('role') === 'button' && e.target.tagName !== 'BUTTON'){
      e.preventDefault();
      e.target.click();
    }
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && e.target.id === 'foodSearchInput'){
      e.preventDefault();
      closeFoodSearchOverlay();
    }
  });

  // Goal inputs save on change (blur/enter), not on every keystroke —
  // avoids writing to localStorage on every digit typed. Same event
  // also handles the "grams" field on a selected search result, which
  // just recomputes the prefill macros rather than saving anything.
  document.addEventListener('change', function(e){
    var ac = e.target.dataset && e.target.dataset.actionChange;
    if (ac === 'save-goal'){
      saveGoalsFromInputs();
    } else if (ac === 'save-profile'){
      if (e.target.id === 'profGoal'){
        var gd = document.getElementById('profGoalDesc');
        if (gd) gd.textContent = goalById(e.target.value).desc;
      }
      saveProfileFromForm();
    }
  });

  // Picking a date in the Day row updates its one-line summary.
  document.addEventListener('change', function(e){
    if (e.target && e.target.id === 'mealDate') updateDayValue();
  });

  // Keep the Nutrition summary line in step with what's typed in the fields.
  document.addEventListener('input', function(e){
    var id = e.target && e.target.id;
    if (id === 'mealCal' || id === 'mealProtein' || id === 'mealCarbs' || id === 'mealFat') updateMealSummary();
  });

  // Typing in the amount box updates the macros live.
  document.addEventListener('input', function(e){
    if (e.target && e.target.id === 'servingQty' && ui.selectedFood){
      setServingQty(parseFloat(e.target.value) || 0);
    }
  });



  /* =========================================================
     INSTALL AS AN APP (PWA)
     Android/desktop Chrome: capture the browser's install prompt and
     offer it from Settings + a dismissible banner on Log.
     iPhone/iPad: no prompt exists, so show "Share > Add to Home Screen".
     ========================================================= */
  var deferredInstall = null;
