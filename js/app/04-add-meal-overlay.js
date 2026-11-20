  /* =========================================================
     FOOD SEARCH — Open Food Facts (free, no API key required)
     https://world.openfoodfacts.org
     ========================================================= */
  function openFoodSearchOverlay(){
    var overlay = document.getElementById('foodSearchOverlay');
    var input = document.getElementById('foodSearchInput');
    input.value = '';
    renderFoodHome();
    overlay.classList.remove('hidden');
    input.focus();
  }

  function closeFoodSearchOverlay(){
    var ov = document.getElementById('foodSearchOverlay');
    ov.classList.add('hidden');
    ov.classList.remove('over-ai');
    ui.replaceAiIdx = null;      // "Search instead" from the AI scan sheet is over
  }

  // Add Meal is a bottom-sheet overlay rather than an inline card —
  // opened by picking a search/scan result, using "Use [query]" for
  // a custom name, or (rarely) directly with nothing prefilled.
  // Populates the real form fields (#mealName etc.) directly rather
  // than going through a full renderApp(), since the sheet is its
  // own layer on top of whatever the Log tab is currently showing.
  // Add Meal shows the meal time and the numbers as one-line summaries.
  function setAccordion(rowId, accId, open){
    var row = document.getElementById(rowId), acc = document.getElementById(accId);
    if (!row || !acc) return;
    acc.classList.toggle('open', open);
    row.setAttribute('aria-expanded', String(open));
  }
  function toggleAccordion(rowId, accId){
    setAccordion(rowId, accId, !document.getElementById(accId).classList.contains('open'));
  }
  function updateMealSummary(){
    var num = function(id){ return Math.round(parseFloat(document.getElementById(id).value) || 0); };
    var el = document.getElementById('nutriSummaryValue');
    if (el) el.innerHTML = num('mealCal') + ' kcal · <span class="ns-p">P' + num('mealProtein') + '</span> · <span class="ns-c">C' + num('mealCarbs') + '</span> · <span class="ns-f">F' + num('mealFat') + '</span>';
  }

  function renderCategoryPicker(){
    var el = document.getElementById('categoryPicker');
    if (!el) return;
    var valueEl = document.getElementById('mealTimeValue');
    if (valueEl){
      var cur = MEAL_CATEGORIES.filter(function(c){ return c.id === ui.selectedCategory; })[0];
      valueEl.textContent = cur ? cur.label : '';
    }
    el.innerHTML = MEAL_CATEGORIES.map(function(c){
      return '<button type="button" class="category-pill' + (c.id === ui.selectedCategory ? ' active' : '') + '" data-action="select-meal-category" data-category="' + c.id + '">' + c.label + '</button>';
    }).join('');
  }

  // Just the banner portion — used on its own by the unit-mode toggle
  // so switching grams/servings doesn't also re-run openAddMealOverlay()'s
  // category auto-suggestion (which would discard a category the person
  // already picked manually).
  function refreshSelectedFoodBanner(){
    var bodyEl = document.getElementById('addMealBody');
    var oldChips = bodyEl.querySelector('.serving-chips');
    var scrolled = oldChips ? oldChips.scrollLeft : 0;
    bodyEl.querySelectorAll('.selected-food-banner').forEach(function(el){ el.remove(); });
    if (ui.selectedFood){
      bodyEl.insertAdjacentHTML('afterbegin', selectedFoodBannerHtml());
      var newChips = bodyEl.querySelector('.serving-chips');
      if (newChips) newChips.scrollLeft = scrolled; // don't jump the row back to the start when a chip is tapped
    }
  }

  /* ---- bottom-sheet helpers, shared by Add Meal and the Scanned-meal sheet ---- */
  function showSheetOverlay(overlay){
    clearTimeout(overlay._closeTimer);
    var sheet = overlay.querySelector('.add-meal-sheet');
    sheet.style.transform = '';
    sheet.classList.remove('dragging');
    overlay.classList.remove('hidden');
    void overlay.offsetHeight;        // paint the closed position first, so it animates up
    overlay.classList.add('open');
  }

  function hideSheetOverlay(overlay){
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.remove('open');
    var sheet = overlay.querySelector('.add-meal-sheet');
    sheet.classList.remove('dragging');
    sheet.style.transform = '';       // hand control back to the CSS slide-down
    overlay._closeTimer = setTimeout(function(){ overlay.classList.add('hidden'); }, prefersReducedMotion() ? 0 : 380);
  }

  // drag the little handle at the top of a sheet down to dismiss it
  function attachSheetDrag(grab, closeFn){
    var sheet = grab.parentNode;
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
      if (dy > 90) closeFn(); else sheet.style.transform = '';
    }
    grab.addEventListener('pointerup', endDrag);
    grab.addEventListener('pointercancel', endDrag);
  }

  // While the on-screen keyboard is up, tell the CSS how much of the
  // screen it covers (--kb) and how much is left (--vvh), so a sheet
  // with fields in it lifts above the keyboard instead of hiding behind it.
  if (window.visualViewport){
    (function(){
      var vv = window.visualViewport;
      function update(){
        var kb = Math.round(window.innerHeight - vv.height - vv.offsetTop);
        var root = document.documentElement.style;
        if (kb > 80){ root.setProperty('--kb', kb + 'px'); root.setProperty('--vvh', Math.round(vv.height) + 'px'); }
        else { root.removeProperty('--kb'); root.removeProperty('--vvh'); }
      }
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    })();
  }

  /* ---- Editing a logged meal, and choosing the day ---- */
  var toastTimer = 0;
  function showToast(message, actionLabel, onAction){
    var el = document.getElementById('toast');
    el.textContent = message;
    el.classList.toggle('has-action', !!actionLabel);
    if (actionLabel){
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'toast-action'; btn.textContent = actionLabel;
      btn.addEventListener('click', function(){
        el.classList.remove('show'); clearTimeout(toastTimer);
        if (onAction) onAction();
      });
      el.appendChild(btn);
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ el.classList.remove('show'); }, actionLabel ? 6000 : 2600);
  }

  function mealById(id){
    return STORE.meals.filter(function(m){ return m.id === id; })[0] || null;
  }

  // The Day row's one-line summary ("Today", "Yesterday", "Mon, Mar 9").
  function updateDayValue(){
    var key = document.getElementById('mealDate').value;
    document.getElementById('dayValue').textContent = /^\d{4}-\d{2}-\d{2}$/.test(key) ? formatDateLabel(key) : 'Today';
    document.querySelectorAll('.day-chip').forEach(function(chip){
      chip.classList.toggle('active', dateKeyDaysAgo(parseInt(chip.dataset.days, 10)) === key);
    });
  }

  // Set the chosen day to `daysAgo` days back (0 = today).
  function setMealDay(daysAgo){
    document.getElementById('mealDate').value = dateKeyDaysAgo(daysAgo);
    updateDayValue();
    setAccordion('dayRow', 'dayAcc', false);
  }

  // The timestamp a meal should get for the picked day: that calendar day
  // at `timeOfDay`'s clock time (so entries keep a sensible order), never
  // in the future. Returns `keep` unchanged when the day didn't change.
  function stampForDay(dayKey, timeOfDay, keep){
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey || '');
    if (!parts) return keep || Date.now();
    if (keep && dateKey(keep) === dayKey) return keep;
    var t = new Date(timeOfDay);
    var stamp = new Date(+parts[1], +parts[2] - 1, +parts[3], t.getHours(), t.getMinutes(), t.getSeconds(), 0).getTime();
    return Math.min(stamp, Date.now());
  }

  // Tap a logged meal (Log or History) to change it: the same sheet as
  // Add Meal, filled in, saving over the original instead of adding one.
  function openEditMeal(id){
    var m = mealById(id);
    if (!m) return;
    clearFoodSelection();
    ui.editingMealId = id;
    ui.prefillName = m.name;
    ui.prefillCal = m.calories; ui.prefillProtein = m.protein; ui.prefillCarbs = m.carbs; ui.prefillFat = m.fat;
    ui.prefillFiber = m.fiber; ui.prefillSugar = m.sugar; ui.prefillSodium = m.sodium;
    ui.justFilledFood = false;
    openAddMealOverlay();
  }

  function openAddMealOverlay(){
    refreshSelectedFoodBanner();

    var editing = ui.editingMealId ? mealById(ui.editingMealId) : null;
    if (ui.editingMealId && !editing) ui.editingMealId = null; // it was deleted meanwhile
    ui.selectedCategory = (editing && editing.category) ? editing.category : addCategoryNow();
    renderCategoryPicker();
    document.getElementById('addMealTitle').textContent = editing ? 'Edit meal' : 'Add Meal';
    document.getElementById('addMealSubmit').textContent = editing ? 'Save changes' : '+ Add Meal';
    document.getElementById('addMealDelete').classList.toggle('hidden', !editing);
    var dateInput = document.getElementById('mealDate');
    dateInput.max = todayKey();
    dateInput.value = editing ? dateKey(editing.loggedAt) : logDayKey();
    updateDayValue();
    setAccordion('dayRow', 'dayAcc', false);

    var editPhoto = editing ? mealPhoto(editing) : '';
    document.getElementById('mealPhotoBox').classList.toggle('hidden', !editPhoto);
    if (editPhoto) document.getElementById('mealPhotoImg').src = editPhoto;

    document.getElementById('mealName').value = ui.prefillName || '';
    document.getElementById('mealCal').value = ui.prefillCal != null ? ui.prefillCal : '';
    document.getElementById('mealProtein').value = ui.prefillProtein != null ? ui.prefillProtein : '';
    document.getElementById('mealCarbs').value = ui.prefillCarbs != null ? ui.prefillCarbs : '';
    document.getElementById('mealFat').value = ui.prefillFat != null ? ui.prefillFat : '';
    document.getElementById('mealSugar').value = ui.prefillSugar != null ? ui.prefillSugar : '';
    document.getElementById('mealSodium').value = ui.prefillSodium != null ? ui.prefillSodium : '';
    var hasMore = (parseFloat(ui.prefillSugar) > 0) || (parseFloat(ui.prefillSodium) > 0);
    document.getElementById('moreNutriRow').classList.toggle('hidden', !hasMore);
    document.getElementById('moreNutriBtn').classList.toggle('hidden', hasMore);

    // Compact by default: the numbers stay tucked away behind their
    // summary when a food was picked (they're already filled in); a
    // custom entry needs typing, so that one starts open.
    updateMealSummary();
    setAccordion('nutriRow', 'nutriAcc', !ui.selectedFood);
    setAccordion('mealTimeRow', 'categoryAcc', false);

    var overlay = document.getElementById('addMealOverlay');
    var sheet = document.getElementById('addMealSheet');
    showSheetOverlay(overlay);
    if (ui.justFilledFood){
      sheet.classList.add('glow-once');
      setTimeout(function(){ sheet.classList.remove('glow-once'); }, 900);
    }
    ui.justFilledFood = false;

    // Autofocus the name field only when it's empty (a fresh custom
    // entry) — a prefilled pick from search doesn't need the keyboard
    // popping up immediately.
    // Focus waits for the slide to finish (the keyboard opening at the
    // same moment made the sheet stutter) and never scrolls the page.
    if (!ui.prefillName){
      setTimeout(function(){
        if (overlay.classList.contains('open')) document.getElementById('mealName').focus({ preventScroll: true });
      }, prefersReducedMotion() ? 0 : 380);
    }
  }

  function closeAddMealOverlay(){
    hideSheetOverlay(document.getElementById('addMealOverlay'));
    clearFoodSelection();
  }

