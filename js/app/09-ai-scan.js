  function aiScanEnabled(){
    return !!AI_SCAN_URL && navigator.onLine !== false;
  }

  function aiNum(v){
    var n = Number(v);
    return (isFinite(n) && n > 0) ? n : 0;
  }

  // Photo -> ~1024px JPEG base64: keeps detail for recognition while
  // staying a few hundred KB, so it's quick on mobile data.
  function aiPhotoToBase64(canvas){
    var max = 1024;
    var scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
    var out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(canvas.width * scale));
    out.height = Math.max(1, Math.round(canvas.height * scale));
    out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.8).split(',')[1];
  }

  // The Worker tells us how many free scans are left; remember it for today
  // (UTC day, like the Worker's counter) so the Add food screen can show it.
  var AI_LEFT_KEY = 'saviorfuel_ai_left';
  function utcDay(){ return new Date().toISOString().slice(0, 10); }
  function aiLeftGet(){
    try {
      var v = JSON.parse(localStorage.getItem(AI_LEFT_KEY) || 'null');
      return (v && v.day === utcDay() && typeof v.n === 'number') ? v.n : null;
    } catch (e){ return null; }
  }
  function aiLeftSet(n){
    try { localStorage.setItem(AI_LEFT_KEY, JSON.stringify({ day: utcDay(), n: n })); } catch (e){}
    refreshAiLeftPill();
  }
  // One place builds the "N free scans left" pill so the Add food screen and
  // the camera always show the same number, even if the screen was drawn
  // before a scan used one up.
  function aiLeftPillHtml(left){
    return '<span class="ai-left-pill"><b>AI</b>' + (left == null ? 'Free daily scans' : (left === 0 ? 'No free scans left today' : left + ' free scan' + (left === 1 ? '' : 's') + ' left')) + '</span>';
  }
  function refreshAiLeftPill(){
    var el = document.querySelector('.ai-left-pill');
    if (!el || !aiScanEnabled()) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = aiLeftPillHtml(aiLeftGet());
    el.innerHTML = tmp.firstChild.innerHTML;
  }

  function runAiScan(canvas){
    if (!STORE.appSettings.aiScanConsent){
      var ok = window.confirm('AI food scan sends this photo to Google\'s Gemini AI to estimate what\'s in it. The server doesn\'t store it; a small thumbnail stays on this phone with your meal. Continue?');
      if (!ok) return Promise.reject({ declined: true });
      STORE.appSettings.aiScanConsent = true;
      saveStore();
    }

    var ctrl = new AbortController();
    var timer = setTimeout(function(){ ctrl.abort(); }, 25000);
    return fetch(AI_SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: aiPhotoToBase64(canvas), mime: 'image/jpeg' }),
      signal: ctrl.signal
    })
      .then(function(res){
        return res.json().catch(function(){ return {}; }).then(function(data){
          if (res.ok && typeof data.remainingToday === 'number') aiLeftSet(data.remainingToday);
          if (!res.ok && data.code === 'ip_limit') aiLeftSet(0);
          if (!res.ok){
            var e = new Error(data.error || ('Scan failed (' + res.status + ')'));
            e.status = res.status;
            e.code = data.code;
            e.userMessage = data.error;
            throw e;
          }
          return data;
        });
      })
      .then(function(data){
        clearTimeout(timer);
        if (!scanState.stream) return; // they hit Cancel while we were waiting
        stopAnalysing();
        var items = Array.isArray(data.items) ? data.items : [];
        if (items.length === 0){
          document.getElementById('scanStatus').textContent = 'Couldn\'t spot any food — get closer, add light, and try again.';
          document.getElementById('scanCaptureBtn').classList.remove('loading');
          scanLoop(); // back to watching for barcodes
          return;
        }
        closeScanner();
        closeFoodSearchOverlay();
        openAiScanSheet(data);
      })
      .catch(function(err){
        clearTimeout(timer);
        throw err;
      });
  }

  // Small JPEG kept with the meal (~300px) — separate from the bigger
  // one sent to the AI, so storage stays light.
  function aiPhotoThumb(canvas){
    try {
      var max = 480;
      var scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
      var out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(canvas.width * scale));
      out.height = Math.max(1, Math.round(canvas.height * scale));
      out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.6);
    } catch (e){ return ''; }
  }

  // While the AI works: freeze the camera on the shot, sweep a scan line
  // over it and walk through three steps (a guide to the wait, not a
  // measurement of it).
  var analysing = { timers: [] };
  function startAnalysing(){
    var ov = document.getElementById('scanOverlay');
    var statusEl = document.getElementById('scanStatus');
    try { document.getElementById('scanVideo').pause(); } catch (e){}
    ov.classList.add('analysing');
    var steps = ['Photo captured', 'Spotting foods', 'Estimating portions'];
    function paint(n){
      statusEl.innerHTML = '<div class="scan-steps">' + steps.map(function(t, i){
        return '<div class="scan-step' + (i < n ? ' done' : (i === n ? ' on' : '')) + '"><i></i>' + t + '</div>';
      }).join('') + '</div>';
    }
    paint(1);
    analysing.timers.forEach(clearTimeout);
    analysing.timers = [setTimeout(function(){ paint(2); }, 2200)];
  }
  function stopAnalysing(){
    analysing.timers.forEach(clearTimeout);
    analysing.timers = [];
    var ov = document.getElementById('scanOverlay');
    if (ov) ov.classList.remove('analysing');
    try { document.getElementById('scanVideo').play(); } catch (e){}
  }

  function aiItemMacros(it){
    var f = it.base.grams > 0 ? it.grams / it.base.grams : 0;
    return {
      calories: it.base.calories * f, protein: it.base.protein * f, carbs: it.base.carbs * f,
      fat: it.base.fat * f, fiber: it.base.fiber * f, sugar: it.base.sugar * f, sodium: it.base.sodium * f
    };
  }

  function aiMacroLine(m){
    return Math.round(m.calories) + ' kcal · P' + Math.round(m.protein) + ' · C' + Math.round(m.carbs) + ' · F' + Math.round(m.fat);
  }

  function renderAiCategoryPicker(){
    document.getElementById('aiCategoryPicker').innerHTML = MEAL_CATEGORIES.map(function(c){
      return '<button type="button" class="category-pill' + (c.id === aiScan.category ? ' active' : '') + '" data-action="ai-select-category" data-category="' + c.id + '">' + c.label + '</button>';
    }).join('');
    var cur = MEAL_CATEGORIES.filter(function(c){ return c.id === aiScan.category; })[0];
    var mv = document.getElementById('aiMealValue');
    if (mv) mv.textContent = cur ? cur.label : '';
  }

  function renderAiScanTotal(){
    var t = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    aiScan.items.forEach(function(it){
      var m = aiItemMacros(it);
      t.calories += m.calories; t.protein += m.protein; t.carbs += m.carbs; t.fat += m.fat;
    });
    var pk = t.protein * 4, ck = t.carbs * 4, fk = t.fat * 9, sum = pk + ck + fk;
    function share(v){ return sum > 0 ? Math.max(3, Math.round(v / sum * 100)) : 0; }
    function col(label, g, v, c){
      return '<div><div class="t"><span>' + label + '</span><b>' + Math.round(g) + 'g</b></div><div class="bar"><i style="width:' + share(v) + '%;background:var(' + c + ')"></i></div></div>';
    }
    var kc = Math.round(t.calories);
    document.getElementById('aiScanTotal').innerHTML =
      '<div class="ai-total-kcal"><b>' + kc + '</b><span>kcal</span></div>' +
      '<div class="ai-macro3">' + col('Protein', t.protein, pk, '--c-protein') + col('Carbs', t.carbs, ck, '--c-carbs') + col('Fat', t.fat, fk, '--c-fat') + '</div>';
    var btn = document.getElementById('aiLogBtn');
    if (btn) btn.textContent = kc > 0 ? '+ Log meal \u00b7 ' + kc + ' kcal' : '+ Log meal';
  }

  function aiUpdateRowNumbers(i){
    var it = aiScan.items[i];
    if (!it) return;
    var m = aiItemMacros(it);
    var k = document.getElementById('aiKcal' + i);
    if (k) k.textContent = Math.round(m.calories) + ' kcal';
    var l = document.getElementById('aiMacros' + i);
    if (l) l.innerHTML = 'P' + Math.round(m.protein) + ' &middot; C' + Math.round(m.carbs) + ' &middot; F' + Math.round(m.fat);
  }

  function aiStep(it){ return Math.max(5, Math.round(it.base.grams * 0.1 / 5) * 5); }

  /* ---- Automatic database match for scanned items ----
     The AI names the food and guesses its weight. For each item we look
     the name up (your saved foods, USDA, Open Food Facts) and, when a
     close match with believable numbers turns up, use that food's real
     per-100 g values scaled to the weight. Anything uncertain stays an
     "AI estimate", and you can always change or undo the match. */
  var AI_STOP = { with: 1, and: 1, of: 1, the: 1, a: 1, in: 1, on: 1 };
  function aiTokens(str){
    return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(function(w){ return w && !AI_STOP[w]; })
      .map(function(w){ return w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; });
  }
  function aiPer100(p){
    var n = p.nutriments || {};
    var sodium = p._source === 'off' ? (n['sodium_100g'] || 0) * 1000 : (n['sodium_100g_mg'] || 0);
    return { calories: Number(n['energy-kcal_100g']) || 0, protein: Number(n['proteins_100g']) || 0, carbs: Number(n['carbohydrates_100g']) || 0,
             fat: Number(n['fat_100g']) || 0, fiber: Number(n['fiber_100g']) || 0, sugar: Number(n['sugars_100g']) || 0, sodium: sodium };
  }
  function aiSrcName(p){ return p._source === 'usda' ? 'USDA' : p._source === 'off' ? 'Open Food Facts' : 'Your foods'; }
  function aiRankCandidates(name, list){
    var q = aiTokens(name);
    if (!q.length) return [];
    var seen = {}, out = [];
    list.forEach(function(p){
      if (p._source === 'saved' && p._servingLabel && !/^100\s*g$/i.test(p._servingLabel)) return;  // per-serving foods can't be scaled by weight
      if (!p.product_name || (p.nutriments || {})['energy-kcal_100g'] == null) return;
      var pt = aiTokens(p.product_name);
      var hit = q.filter(function(w){ return pt.indexOf(w) !== -1; }).length;
      var cover = hit / q.length;
      if (cover < (q.length <= 2 ? 0.99 : 0.75)) return;
      var extra = pt.length - hit;
      if (p._source === 'off' && extra > 4) return;
      if (extra > 10) return;
      var key = p.product_name.trim().toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ p: p, score: cover - 0.03 * extra + (p._source === 'saved' ? 0.25 : p._source === 'usda' ? 0.05 : 0) });
    });
    out.sort(function(a, b){ return b.score - a.score; });
    return out.slice(0, 4).map(function(x){ return x.p; });
  }
  function aiSane(it, p){
    var ai100 = it.ai && it.ai.grams > 0 ? it.ai.calories / it.ai.grams * 100 : 0;
    var c100 = aiPer100(p).calories;
    if (!(ai100 > 0)) return c100 > 0;
    var r = c100 / ai100;
    return r >= 0.5 && r <= 2;
  }
  function aiApplyMatch(it, p){
    var per = aiPer100(p), g = it.grams > 0 ? it.grams : (it.ai ? it.ai.grams : 100), f = g / 100;
    it.base = { grams: g, calories: per.calories * f, protein: per.protein * f, carbs: per.carbs * f, fat: per.fat * f,
                fiber: per.fiber * f, sugar: per.sugar * f, sodium: per.sodium * f };
    it.state = 'match';
    it.match = p;
  }
  function aiUseEstimate(it){
    var f = it.ai.grams > 0 ? it.grams / it.ai.grams : 1;
    it.base = { grams: it.grams > 0 ? it.grams : it.ai.grams, calories: it.ai.calories * f, protein: it.ai.protein * f, carbs: it.ai.carbs * f,
                fat: it.ai.fat * f, fiber: it.ai.fiber * f, sugar: it.ai.sugar * f, sodium: it.ai.sodium * f };
    it.state = 'estimate';
    it.match = null;
  }
  var AI_CHK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var AI_CHV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  function aiSrcHtml(it, i){
    if (it.manual && it.state !== 'list') return '';
    if (it.state === 'pending') return '<span class="src pend">Checking food databases…</span>';
    if (it.state === 'list') return '<span class="src db">' + AI_CHK + 'From food list <small>· ' + esc(String(it.matchName || '').slice(0, 26)) + '</small></span>';
    if (it.state === 'match' && it.match){
      return '<button type="button" class="src db" data-action="ai-pick-match" data-i="' + i + '">' + AI_CHK + esc(aiSrcName(it.match)) +
        ' <small>· ' + esc(String(it.match.product_name).slice(0, 26)) + '</small>' + AI_CHV + '</button>';
    }
    return '<button type="button" class="src ai" data-action="ai-pick-match" data-i="' + i + '">AI estimate <small>· tap to find a match</small>' + AI_CHV + '</button>';
  }
  function aiRefreshItem(i){
    var it = aiScan.items[i];
    if (!it) return;
    var box = document.getElementById('aiSrc' + i);
    if (box) box.innerHTML = aiSrcHtml(it, i);
    aiUpdateRowNumbers(i);
    renderAiScanTotal();
  }
  function startAiMatching(){
    var token = aiScan.token = (aiScan.token || 0) + 1;
    if (aiScan.abort){ try { aiScan.abort.abort(); } catch (e){} }
    var ctrl = aiScan.abort = new AbortController();
    aiScan.items.forEach(function(it, i){
      var finish = function(cands){
        if (token !== aiScan.token || aiScan.items[i] !== it) return;      // sheet closed or item swapped meanwhile
        if (it.state !== 'pending') return;
        it.cands = cands;
        var best = cands.filter(function(p){ return aiSane(it, p); })[0];
        if (best) aiApplyMatch(it, best); else it.state = 'estimate';
        aiRefreshItem(i);
      };
      var name = String(it.name || '').trim();
      if (name.length < 2){ finish([]); return; }
      var all = searchSavedFoods(name);
      if (navigator.onLine === false){ finish(aiRankCandidates(name, all)); return; }
      var settle = function(list){ return list || []; };
      Promise.all([
        searchFoodSource('USDA', name, fetchUSDA, ctrl.signal).then(settle, function(){ return []; }),
        searchFoodSource('Open Food Facts', name, fetchOpenFoodFacts, ctrl.signal).then(settle, function(){ return []; })
      ]).then(function(r){ finish(aiRankCandidates(name, all.concat(r[0], r[1]))); }, function(){ finish(aiRankCandidates(name, all)); });
    });
  }

  function closeAiMatchPicker(){
    var el = document.getElementById('aiMatchPicker');
    if (el) el.remove();
  }
  function openAiMatchPicker(i){
    var it = aiScan.items[i];
    if (!it || it.state === 'pending') return;
    closeAiMatchPicker();
    var cands = (it.cands || []).slice(0, 4);
    var g = it.grams > 0 ? it.grams : 100;
    var kcalFor = function(p){ return Math.round(aiPer100(p).calories * g / 100); };
    var opts = cands.map(function(p, k){
      var sel = it.state === 'match' && it.match === p;
      return '<button type="button" class="pk-opt' + (sel ? ' sel' : '') + '" data-action="ai-match-choose" data-i="' + i + '" data-k="' + k + '"><i class="r"></i>' +
        '<span class="pk-tx"><b>' + esc(String(p.product_name).slice(0, 48)) + '</b><span>' + esc(aiSrcName(p)) + ' · per 100 g: ' + Math.round(aiPer100(p).calories) + ' kcal</span></span>' +
        '<em>' + kcalFor(p) + ' kcal</em></button>';
    }).join('');
    var aiK = Math.round(it.ai.grams > 0 ? it.ai.calories * g / it.ai.grams : it.ai.calories);
    opts += '<button type="button" class="pk-opt' + (it.state !== 'match' ? ' sel' : '') + '" data-action="ai-match-choose" data-i="' + i + '" data-k="ai"><i class="r"></i>' +
      '<span class="pk-tx"><b>Use the AI estimate</b><span>From the photo only</span></span><em>' + aiK + ' kcal</em></button>';
    var el = document.createElement('div');
    el.id = 'aiMatchPicker';
    el.innerHTML = '<div class="pk-back" data-action="ai-match-close"></div><div class="pk" role="dialog" aria-label="Pick a match">' +
      '<div class="pk-grab"></div><h4>Match for “' + esc(String(it.name).slice(0, 30)) + '”</h4>' +
      '<div class="pk-sub">Numbers come from the food you pick, scaled to ' + Math.round(g) + ' g.</div>' + opts +
      '<button type="button" class="pk-more" data-action="ai-match-search" data-i="' + i + '">Search all foods…</button></div>';
    document.getElementById('app').parentNode.appendChild(el);
  }

  function renderAiScanItems(){
    document.getElementById('aiScanItems').innerHTML = aiScan.items.map(function(it, i){
      var m = aiItemMacros(it);
      var controls;
      if (it.manual){
        controls = '<div class="ai-item-manual"><span>Calories</span>' +
          '<input type="number" inputmode="decimal" data-ai-field="kcal" data-i="' + i + '" value="' + (it.base.calories || '') + '" min="0" max="5000" placeholder="0" aria-label="Calories"><span>kcal</span></div>';
      } else {
        controls = '<div class="ai-item-bottom">' +
          '<div class="ai-stepper">' +
            '<button type="button" data-action="ai-step" data-i="' + i + '" data-d="-1" aria-label="Less">&minus;</button>' +
            '<input type="number" inputmode="decimal" class="ai-item-grams" data-ai-field="grams" data-i="' + i + '" value="' + it.grams + '" min="0" max="3000" aria-label="Grams">' +
            '<span class="ai-item-unit">g</span>' +
            '<button type="button" data-action="ai-step" data-i="' + i + '" data-d="1" aria-label="More">+</button>' +
          '</div>' +
          '<div class="ai-scale">' + [0.5, 1, 1.5].map(function(f){
            return '<button type="button" data-action="ai-scale" data-i="' + i + '" data-f="' + f + '" class="' + (it.grams === Math.round(it.base.grams * f) ? 'active' : '') + '">&times;' + f + '</button>';
          }).join('') + '</div>' +
        '</div>';
      }
      return '<div class="ai-item">' +
        '<div class="ai-item-top">' +
          '<input type="text" class="ai-item-name" data-ai-field="name" data-i="' + i + '" value="' + esc(it.name) + '" maxlength="60" placeholder="Food name" aria-label="Food name">' +
          '<span class="ai-item-kcal" id="aiKcal' + i + '">' + Math.round(m.calories) + ' kcal</span>' +
          '<button type="button" class="ai-item-del" data-action="ai-remove-item" data-i="' + i + '" aria-label="Remove ' + esc(it.name) + '">&times;</button>' +
        '</div>' +
        '<div class="ai-item-macros" id="aiMacros' + i + '">P' + Math.round(m.protein) + ' &middot; C' + Math.round(m.carbs) + ' &middot; F' + Math.round(m.fat) + '</div>' +
        controls +
        '<div class="ai-src" id="aiSrc' + i + '">' + aiSrcHtml(it, i) + '</div>' +
      '</div>';
    }).join('');
    renderAiScanTotal();
  }

  function openAiScanSheet(data){
    aiScan.items = data.items.map(function(it){
      var g = Math.max(1, aiNum(it.grams) || 100);
      return {
        name: String(it.name || 'Food').slice(0, 60),
        grams: Math.round(g),
        base: {
          grams: g, calories: aiNum(it.calories), protein: aiNum(it.protein_g), carbs: aiNum(it.carbs_g),
          fat: aiNum(it.fat_g), fiber: aiNum(it.fiber_g), sugar: aiNum(it.sugar_g), sodium: aiNum(it.sodium_mg)
        },
        state: 'pending'
      };
    });
    aiScan.items.forEach(function(it){ it.ai = JSON.parse(JSON.stringify(it.base)); it.aiGrams = it.grams; });
    aiScan.category = suggestCategoryForNow();
    var noteEl = document.getElementById('aiScanNote');
    var noteTxt = data.note ? String(data.note).slice(0, 140) : '';
    if (aiScan.photo) noteTxt += (noteTxt ? (/[.!?]$/.test(noteTxt) ? ' ' : '. ') : '') + 'Tap the photo to enlarge.';
    noteEl.textContent = noteTxt;
    noteEl.style.display = noteTxt ? '' : 'none';
    var th = document.getElementById('aiScanThumb');
    var hero = document.getElementById('aiScanHero');
    if (aiScan.photo){ th.src = aiScan.photo; hero.classList.remove('hidden'); } else hero.classList.add('hidden');
    setAccordion('aiMealRow', 'aiCategoryAcc', false);
    renderAiCategoryPicker();
    renderAiScanItems();
    showSheetOverlay(document.getElementById('aiScanOverlay'));
    startAiMatching();
  }

  function openAiZoom(src){
    if (!src) return;
    document.getElementById('aiZoomImg').src = src;
    document.getElementById('aiZoom').classList.remove('hidden');
  }
  function closeAiZoom(){
    document.getElementById('aiZoom').classList.add('hidden');
    document.getElementById('aiZoomImg').removeAttribute('src');
  }
  document.addEventListener('click', function(e){
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#aiZoom')){ closeAiZoom(); return; }
    if (t.closest('#aiScanHero')){ openAiZoom(aiScan.photo); return; }
    if (t.id === 'mealPhotoImg'){ openAiZoom(t.getAttribute('src')); }
  });

  function closeAiScanSheet(){
    if (aiScan.abort){ try { aiScan.abort.abort(); } catch (e){} aiScan.abort = null; }
    aiScan.token = (aiScan.token || 0) + 1;
    closeAiMatchPicker();
    hideSheetOverlay(document.getElementById('aiScanOverlay'));
    aiScan.items = [];
    aiScan.photo = '';
  }

  attachSheetDrag(document.getElementById('addMealGrab'), closeAddMealOverlay);
  attachSheetDrag(document.getElementById('aiScanGrab'), closeAiScanSheet);

  function logAiScan(){
    var now = Date.now();
    var logged = 0;
    var photoId = aiScan.photo ? 'p_' + now + '_' + Math.random().toString(36).slice(2, 6) : '';
    aiScan.items.forEach(function(it, i){
      var name = it.name.trim();
      var m = aiItemMacros(it);
      if (!name || it.grams <= 0 || m.calories <= 0) return; // skip blanks / zeroed-out rows
      STORE.meals.push({
        id: 'm_' + now + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
        name: name,
        calories: Math.round(m.calories),
        protein: Math.round(m.protein),
        carbs: Math.round(m.carbs),
        fat: Math.round(m.fat),
        fiber: Math.round(m.fiber),
        sugar: Math.round(m.sugar),
        sodium: Math.round(m.sodium),
        category: aiScan.category,
        loggedAt: now,
        photoId: photoId || undefined
      });
      logged++;
    });
    if (logged === 0) return;
    if (photoId){
      if (!STORE.photos) STORE.photos = {};
      STORE.photos[photoId] = aiScan.photo;
      capPhotos(STORE.photos, STORE.meals);
    }
    expandMealGroup(aiScan.category);
    saveStore();
    maybeVibrate();
    closeAiScanSheet();
    if (state.tab === 'scan') state.tab = 'log';
    renderApp();
  }

  // Editing a name or grams updates that row's numbers and the total in
  // place (no re-render, so the keyboard and cursor stay put).
  document.addEventListener('input', function(e){
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var field = t.getAttribute('data-ai-field');
    if (!field) return;
    var i = parseInt(t.getAttribute('data-i'), 10);
    var it = aiScan.items[i];
    if (!it) return;
    if (field === 'name'){
      it.name = t.value;
    } else if (field === 'grams'){
      it.grams = Math.min(3000, Math.max(0, parseFloat(t.value) || 0));
      aiUpdateRowNumbers(i);
      var chips = t.closest('.ai-item').querySelectorAll('.ai-scale button');
      Array.prototype.forEach.call(chips, function(b){
        b.classList.toggle('active', it.grams === Math.round(it.base.grams * parseFloat(b.getAttribute('data-f'))));
      });
      renderAiScanTotal();
    } else if (field === 'kcal'){
      it.grams = 100;
      it.base.grams = 100;
      it.base.calories = Math.min(5000, Math.max(0, parseFloat(t.value) || 0));
      aiUpdateRowNumbers(i);
      renderAiScanTotal();
    }
  });


