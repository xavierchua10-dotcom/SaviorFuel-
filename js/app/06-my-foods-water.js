  // ---- My Foods + Quick Add ----
  // My Foods are the person's own foods, stored per serving. They reuse the
  // "saved food" shape so the existing serving picker and Add Meal flow just
  // work; _mine marks them so they get an edit button and never land in the
  // Recent cache.
  function myFoodToProduct(f){
    return {
      product_name: f.name, brands: '', _image: '', _note: '', _source: 'saved', _mine: true, _myId: f.id,
      _servingLabel: f.serving || '1 serving',
      nutriments: {
        'energy-kcal_100g': f.calories || 0, 'proteins_100g': f.protein || 0, 'carbohydrates_100g': f.carbs || 0,
        'fat_100g': f.fat || 0, 'fiber_100g': f.fiber || 0, 'sugars_100g': 0, 'sodium_100g_mg': 0
      }
    };
  }
  function myFoodProducts(){ return (STORE.myFoods || []).map(myFoodToProduct); }

  var EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';

  function closeFoodSheet(){
    var el = document.getElementById('foodSheet');
    if (el) el.remove();
  }

  function sheetField(id, label, ph, type){
    return '<div class="fs-field"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" type="' + (type || 'number') + '"' + (type === 'text' ? '' : ' inputmode="decimal"') + ' placeholder="' + ph + '" autocomplete="off"></div>';
  }

  // mode: 'quick' (log calories now) | 'mine' (create / edit a My Food)
  var sheetBarcode = '';
  function openFoodSheet(mode, id, opts){
    closeFoodSheet();
    opts = opts || {};
    sheetBarcode = opts.barcode || '';
    var editing = (mode === 'mine' && id) ? (STORE.myFoods || []).filter(function(f){ return f.id === id; })[0] : null;
    var quick = mode === 'quick';
    var el = document.createElement('div');
    el.className = 'stats-sheet'; el.id = 'foodSheet';
    el.innerHTML = '<div class="stats-sheet-card"><div class="stats-sheet-head"><h3>' +
        (quick ? 'Quick add' : (editing ? 'Edit food' : 'New food')) + '</h3>' +
        '<button type="button" class="stats-sheet-x" data-action="close-food-sheet" aria-label="Close">&times;</button></div>' +
      (quick
        ? '<p class="fs-hint">Know the calories but not the food? Log it in one step.</p>' + sheetField('fsCal', 'Calories', '0') + sheetField('fsName', 'Name (optional)', 'Quick add', 'text')
        : (opts.hint ? '<p class="fs-hint">' + esc(opts.hint) + '</p>' : '') + sheetField('fsName', 'Name', 'e.g. Mum’s nasi lemak', 'text') + sheetField('fsServing', 'One serving is', '1 plate', 'text') + sheetField('fsCal', 'Calories per serving', '0')) +
      '<div class="fs-row">' + sheetField('fsP', 'Protein g', '0') + sheetField('fsC', 'Carbs g', '0') + sheetField('fsF', 'Fat g', '0') + '</div>' +
      '<button type="button" class="fs-save" data-action="save-food-sheet" data-mode="' + mode + '" data-id="' + (editing ? editing.id : '') + '">' +
        (quick ? 'Add to ' + (logDayKey() === todayKey() ? 'today' : formatDateLabel(logDayKey())) : 'Save food') + '</button>' +
      (editing ? '<button type="button" class="fs-delete" data-action="delete-my-food" data-id="' + editing.id + '">Delete this food</button>' : '') +
    '</div>';
    el.addEventListener('click', function(e){ if (e.target === el) closeFoodSheet(); });
    document.body.appendChild(el);
    if (editing){
      document.getElementById('fsName').value = editing.name;
      document.getElementById('fsServing').value = editing.serving || '';
      document.getElementById('fsCal').value = editing.calories || '';
      document.getElementById('fsP').value = editing.protein || '';
      document.getElementById('fsC').value = editing.carbs || '';
      document.getElementById('fsF').value = editing.fat || '';
      sheetBarcode = editing.barcode || '';
    } else if (opts.name){
      document.getElementById('fsName').value = opts.name;
    }
    setTimeout(function(){
      var first = document.getElementById(quick ? 'fsCal' : 'fsName');
      if (first) first.focus({ preventScroll: true });
    }, 120);
  }

  function saveFoodSheet(mode, id){
    var num = function(i){ var el = document.getElementById(i); var v = el ? parseFloat(el.value) : 0; return isFinite(v) ? Math.max(0, Math.round(v)) : 0; };
    var txt = function(i){ var el = document.getElementById(i); return el ? el.value.trim() : ''; };
    var cal = num('fsCal');
    var calRaw = document.getElementById('fsCal');
    if (!calRaw || calRaw.value.trim() === ''){ showToast('Add the calories first'); return; }   // 0 is allowed
    if (mode === 'quick'){
      var dayKey = logDayKey();
      var cat = suggestCategoryForNow();
      STORE.meals.push({
        id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: txt('fsName') || 'Quick add', calories: cal, protein: num('fsP'), carbs: num('fsC'), fat: num('fsF'),
        fiber: 0, sugar: 0, sodium: 0, category: cat, loggedAt: stampForDay(dayKey, Date.now(), null)
      });
      expandMealGroup(cat);
      saveStore(); maybeVibrate();
      closeFoodSheet(); closeFoodSearchOverlay();
      if (state.tab === 'scan') state.tab = 'log';
      renderApp();
      showToast('Added ' + cal + ' kcal');
      return;
    }
    var name = txt('fsName');
    if (!name){ showToast('Give the food a name'); return; }
    var food = { id: id || ('mf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)), name: name, serving: txt('fsServing'),
      calories: cal, protein: num('fsP'), carbs: num('fsC'), fat: num('fsF'), barcode: sheetBarcode || undefined };
    var scannedBarcode = sheetBarcode;
    var list = STORE.myFoods || (STORE.myFoods = []);
    var at = -1;
    list.forEach(function(f, i){ if (f.id === food.id) at = i; });
    if (at >= 0) list[at] = food; else list.unshift(food);
    saveStore(); maybeVibrate();
    closeFoodSheet();
    if (scannedBarcode && at < 0){
      // saved straight from a scan: carry on to logging it
      ui.lastSearchProducts = [myFoodToProduct(food)];
      pickFoodResult(0);
      showToast('Saved — scan it again any time');
      return;
    }
    var input = document.getElementById('foodSearchInput');
    if (input && input.value.trim().length >= 2) searchFoodDebounced(input.value); else renderFoodHome();
    showToast('Saved to My Foods');
  }

  function deleteMyFood(id){
    var food = (STORE.myFoods || []).filter(function(f){ return f.id === id; })[0];
    openConfirmSheet({
      title: 'Delete this food?',
      name: food ? food.name : 'This food',
      note: 'It\u2019s removed from My Foods. Meals you already logged stay as they are.',
      confirmLabel: 'Delete',
      onConfirm: function(){
        STORE.myFoods = (STORE.myFoods || []).filter(function(f){ return f.id !== id; });
        saveStore();
        closeFoodSheet();
        renderFoodHome();
      }
    });
  }

  // ---- Water ----
  function waterFor(key){ return Math.max(0, (STORE.water && STORE.water[key]) || 0); }
  function addWater(delta){
    var key = logDayKey();
    if (!STORE.water) STORE.water = {};
    var next = Math.max(0, waterFor(key) + delta);
    if (next === 0) delete STORE.water[key]; else STORE.water[key] = next;
    saveStore();
    maybeVibrate();
    // Swap just the water row so the 3D ring isn't rebuilt and the page doesn't jump back to the top.
    var row = document.querySelector('.water-row');
    if (row && state.tab === 'log') row.outerHTML = waterRowHtml(key);
    else renderApp();
  }
  function fmtWater(ml){ return ml >= 1000 ? (Math.round(ml / 10) / 100) + ' L' : ml + ' ml'; }
  function waterTileHtml(key){
    var goal = STORE.goals.water || DEFAULT_GOALS.water;
    var ml = waterFor(key);
    var p = goal > 0 ? Math.min(100, Math.round(ml / goal * 100)) : 0;
    return '<div class="log-tile water"><span class="lt-ic wt"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c-3 4.2-6 7.3-6 11a6 6 0 0 0 12 0c0-3.7-3-6.8-6-11z"></path></svg></span>' +
      '<b>WATER</b><small>' + fmtWater(ml) + ' / ' + fmtWater(goal) + '</small>' +
      '<div class="water-bar"><i style="width:' + p + '%"></i></div>' +
      '<div class="lt-btns">' + (ml > 0 ? '<button type="button" class="water-btn minus" data-action="water-add" data-ml="-250" aria-label="Remove 250 ml">−</button>' : '') +
      '<button type="button" class="water-btn" data-action="water-add" data-ml="250" aria-label="Add 250 ml">+250 ml</button></div></div>';
  }

  function waterRowHtml(key){
    var goal = STORE.goals.water || DEFAULT_GOALS.water;
    var ml = waterFor(key);
    var p = goal > 0 ? Math.min(100, Math.round(ml / goal * 100)) : 0;
    return '<div class="water-row"><span class="water-ic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c-3 4.2-6 7.3-6 11a6 6 0 0 0 12 0c0-3.7-3-6.8-6-11z"></path></svg></span>' +
      '<div class="water-main"><div class="water-top"><b>Water</b><span>' + fmtWater(ml) + ' / ' + fmtWater(goal) + '</span></div>' +
      '<div class="water-bar"><i style="width:' + p + '%"></i></div></div>' +
      (ml > 0 ? '<button type="button" class="water-btn minus" data-action="water-add" data-ml="-250" aria-label="Remove 250 ml">−</button>' : '') +
      '<button type="button" class="water-btn" data-action="water-add" data-ml="250" aria-label="Add 250 ml">+250 ml</button></div>';
  }

  // One result row — shared by live search results and the empty-search
  // "Favorites / Recent" home. Saved foods get a star to pin them.
  var STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><polygon points="12 2.5 14.9 8.6 21.5 9.4 16.6 14 17.9 20.6 12 17.3 6.1 20.6 7.4 14 2.5 9.4 9.1 8.6"></polygon></svg>';
  /* ---- Search row polish: highlight what you typed, split "Name (detail)"
     into a title and a quieter detail line, and remember the serving you
     used last for each food (kept on this phone only). ---- */
  var rowHl = '';
