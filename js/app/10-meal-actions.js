  function addMealFromForm(){
    var name = document.getElementById('mealName').value.trim();
    // Decimals are rounded (12.7 g -> 13, not cut to 12), negatives count as 0.
    var field = function(id){
      var v = parseFloat(document.getElementById(id).value);
      return isFinite(v) ? Math.max(0, Math.round(v)) : 0;
    };
    var cal = field('mealCal');
    var protein = field('mealProtein');
    var carbs = field('mealCarbs');
    var fat = field('mealFat');
    var fiber = 0;
    var sugar = field('mealSugar');
    var sodium = field('mealSodium');

    // A name and a calories entry are required. 0 is fine when typed on purpose (black coffee, plain tea, water).
    if (!name || document.getElementById('mealCal').value.trim() === '') return;
    if (cal > 10000 || protein > 1000 || carbs > 1000 || fat > 1000){
      showToast('Those numbers look too high for one meal. Please check them.');
      return;
    }

    var dayKey = document.getElementById('mealDate').value;
    var editing = ui.editingMealId ? mealById(ui.editingMealId) : null;
    var savedId, movedTo = null;

    if (editing){
      // Change the existing entry in place (same id), keeping its time of
      // day unless the day was changed.
      var oldKey = dateKey(editing.loggedAt);
      editing.name = name; editing.calories = cal; editing.protein = protein; editing.carbs = carbs;
      editing.fat = fat; editing.sugar = sugar; editing.sodium = sodium;
      editing.category = ui.selectedCategory;
      editing.loggedAt = stampForDay(dayKey, editing.loggedAt, editing.loggedAt);
      savedId = editing.id;
      if (dateKey(editing.loggedAt) !== oldKey) movedTo = dateKey(editing.loggedAt);
    } else {
      savedId = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      rememberServing();
      var stamp = stampForDay(dayKey, Date.now(), null);
      STORE.meals.push({
        id: savedId,
        name: name,
        calories: cal,
        protein: protein,
        carbs: carbs,
        fat: fat,
        fiber: fiber,
        sugar: sugar,
        sodium: sodium,
        category: ui.selectedCategory,
        loggedAt: stamp
      });
      if (dateKey(stamp) !== todayKey()) movedTo = dateKey(stamp);
    }
    expandMealGroup(ui.selectedCategory);
    saveStore();
    maybeVibrate();
    closeAddMealOverlay(); // also clears the food selection state
    if (state.tab === 'scan') state.tab = 'log'; // came from the Scan tab — show where the meal landed
    renderApp();

    // Meals for another day don't show on today's Log, so say where it went.
    if (movedTo) showToast((editing ? 'Moved to ' : 'Added to ') + formatDateLabel(movedTo) + ' \u2014 see History');
    else if (editing) showToast('Changes saved');

    // Same glow treatment as the Add Meal sheet gets when a food is
    // auto-filled — reused here to confirm the meal actually landed
    // in the list, once the row exists in the DOM post-render.
    var newRow = document.querySelector('.meal-row[data-id="' + savedId + '"]');
    if (newRow){
      newRow.classList.add('glow-once');
      setTimeout(function(){ newRow.classList.remove('glow-once'); }, 900);
    }
  }

  function removeMealPhoto(){
    var m = ui.editingMealId ? mealById(ui.editingMealId) : null;
    if (!m || !m.photoId) return;
    var pid = m.photoId;
    delete m.photoId;
    var shared = STORE.meals.some(function(x){ return x.photoId === pid; });
    if (!shared && STORE.photos) delete STORE.photos[pid];
    saveStore();
    document.getElementById('mealPhotoBox').classList.add('hidden');
    renderApp();
    showToast('Photo removed');
  }

  function deleteMeal(id){
    var removed = mealById(id);
    STORE.meals = STORE.meals.filter(function(m){ return m.id !== id; });
    saveStore();
    renderApp();
    if (removed){
      showToast('Meal deleted', 'Undo', function(){
        STORE.meals.push(removed);
        saveStore();
        renderApp();
      });
    }
  }

  // Copy a meal from another day to today (same food, same meal time).
  function copyMealToToday(id, category){
    var m = mealById(id);
    if (!m) return;
    var copy = Object.assign({}, m, {
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      loggedAt: Date.now()
    });
    if (category) copy.category = category;
    STORE.meals.push(copy);
    expandMealGroup(copy.category);
    saveStore();
    maybeVibrate();
    renderApp();
    showToast(category ? 'Added to ' + (CATEGORY_LABELS[category] || 'today') : 'Copied to today');
  }

  /* "Log again?" sheet for the Recent chips on the Add food screen. */
  var recentSheet = { id: null, category: null };
  function lastLoggedLabel(ts){
    var a = new Date(ts), n = new Date();
    a.setHours(0, 0, 0, 0); n.setHours(0, 0, 0, 0);
    var d = Math.round((n - a) / 86400000);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    if (d < 7) return d + ' days ago';
    return a.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function openRecentSheet(id){
    var m = mealById(id);
    if (!m) return;
    recentSheet.id = id;
    recentSheet.category = suggestCategoryForNow();
    var ph = mealPhoto(m);
    var kc = Math.round(m.calories);
    document.getElementById('recentBody').innerHTML =
      '<div class="rc-card">' +
        (ph ? '<img class="rc-img" src="' + ph + '" alt="">' : '') +
        '<div class="rc-tx"><div class="rc-name">' + esc(tidyName(m.name)) + '</div>' +
          '<div class="rc-sub">P' + Math.round(m.protein) + ' &middot; C' + Math.round(m.carbs) + ' &middot; F' + Math.round(m.fat) + ' &middot; last logged ' + lastLoggedLabel(m.loggedAt) + '</div></div>' +
        '<div class="rc-kcal"><b>' + kc + '</b><span>kcal</span></div>' +
      '</div>' +
      '<div class="rc-label">Add to today as</div>' +
      '<div class="category-picker ai-cats" id="recentCats">' + MEAL_CATEGORIES.map(function(c){
        return '<button type="button" class="category-pill' + (c.id === recentSheet.category ? ' active' : '') + '" data-action="recent-select-category" data-category="' + c.id + '">' + c.label + '</button>';
      }).join('') + '</div>' +
      '<button type="button" class="btn-primary" data-action="recent-log">+ Log today &middot; ' + kc + ' kcal</button>' +
      '<button type="button" class="rc-cancel" data-action="close-recent-sheet">Cancel</button>';
    showSheetOverlay(document.getElementById('recentOverlay'));
    var box = document.getElementById('recentCats');
    var act = box.querySelector('.active');
    if (act) box.scrollLeft = Math.max(0, act.offsetLeft - (box.clientWidth - act.offsetWidth) / 2);
  }
  function closeRecentSheet(){
    hideSheetOverlay(document.getElementById('recentOverlay'));
    recentSheet.id = null;
  }
  attachSheetDrag(document.getElementById('recentGrab'), closeRecentSheet);

  /* ---- Confirmation bottom sheet ----
     opts: title, name, detail, kcal, note, confirmLabel, onConfirm.
     Slides up from the bottom; closes on Cancel, a tap outside, Escape,
     or by dragging the grab handle down. Nothing happens to the data
     until "Delete" is pressed. */
  var confirmState = { onConfirm: null, closeTimer: 0 };

  function openConfirmSheet(opts){
    clearTimeout(confirmState.closeTimer);
    confirmState.onConfirm = opts.onConfirm;
    document.getElementById('confirmTitle').textContent = opts.title;
    document.getElementById('confirmItemName').textContent = opts.name;
    document.getElementById('confirmItemDetail').textContent = opts.detail || '';
    document.getElementById('confirmItemKcal').textContent = opts.kcal != null ? opts.kcal + ' kcal' : '';
    document.getElementById('confirmNote').textContent = opts.note || '';
    document.getElementById('confirmYes').textContent = opts.confirmLabel || 'Delete';
    var overlay = document.getElementById('confirmOverlay');
    var sheet = overlay.querySelector('.confirm-sheet');
    sheet.style.transform = '';
    sheet.classList.remove('dragging');
    overlay.classList.remove('hidden');
    void overlay.offsetHeight;          // let the closed position paint first, so it animates up
    overlay.classList.add('open');
    // The safe choice is the default. preventScroll matters: the sheet is
    // still off-screen when this runs, and a plain focus() makes the
    // browser scroll the whole app to bring the button into view — that
    // was the "jump" on open.
    document.getElementById('confirmCancel').focus({ preventScroll: true });
  }

  function closeConfirmSheet(){
    var overlay = document.getElementById('confirmOverlay');
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.remove('open');
    var sheet = overlay.querySelector('.confirm-sheet');
    sheet.classList.remove('dragging');
    sheet.style.transform = '';         // hand control back to the CSS slide-down
    confirmState.onConfirm = null;
    confirmState.closeTimer = setTimeout(function(){ overlay.classList.add('hidden'); }, prefersReducedMotion() ? 0 : 380);
  }

  function confirmYes(){
    var fn = confirmState.onConfirm;
    closeConfirmSheet();
    if (fn) fn();
  }

  function requestDeleteMeal(id){
    var meal = STORE.meals.filter(function(m){ return m.id === id; })[0];
    if (!meal) return;
    openConfirmSheet({
      title: 'Delete this food?',
      name: meal.name,
      detail: 'P' + (meal.protein || 0) + ' · C' + (meal.carbs || 0) + ' · F' + (meal.fat || 0),
      kcal: meal.calories,
      note: 'It will be removed from your log and from the day\u2019s totals.',
      confirmLabel: 'Delete',
      onConfirm: function(){ deleteMeal(id); maybeVibrate(); }
    });
  }

  (function(){
    // drag the grab handle down to dismiss
    var grab = document.getElementById('confirmGrab');
    var sheet = document.querySelector('#confirmOverlay .confirm-sheet');
    var startY = null;
    grab.addEventListener('pointerdown', function(e){
      startY = e.clientY;
      sheet.classList.add('dragging');
      if (grab.setPointerCapture){ try { grab.setPointerCapture(e.pointerId); } catch (err){} }
    });
    grab.addEventListener('pointermove', function(e){
      if (startY === null) return;
      sheet.style.transform = 'translateY(' + Math.max(0, e.clientY - startY) + 'px)';
    });
    function endDrag(e){
      if (startY === null) return;
      var dy = Math.max(0, e.clientY - startY);
      startY = null;
      sheet.classList.remove('dragging');
      if (dy > 90) closeConfirmSheet(); else sheet.style.transform = '';
    }
    grab.addEventListener('pointerup', endDrag);
    grab.addEventListener('pointercancel', endDrag);
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && document.getElementById('confirmOverlay').classList.contains('open')) closeConfirmSheet();
    });
  })();


