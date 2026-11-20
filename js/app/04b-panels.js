  /* ---- In-app panels: one bottom sheet (#panelOverlay) used instead of the phone's plain popups.
     - Choice picker: replaces native <select> lists (Sex, Activity level, Goal). The real <select> stays in the page, hidden,
       so the existing save/read code keeps working; the panel just sets its value and fires "change".
     - Weight panel and Name panel: replace window.prompt. */
  var PN = { kind: null, sel: null, btn: null, unit: 'metric', timer: 0 };
  var ACTIVITY_DESC = {
    sedentary: 'Desk job, little exercise',
    light: '1–3 workouts a week',
    moderate: '3–5 workouts a week',
    active: '6–7 workouts a week',
    extra: 'Hard physical job plus training'
  };
  var PANEL_TITLES = { profSex: 'Sex', profActivity: 'Activity level', wActivity: 'Activity level', profGoal: 'Goal' };
  var PN_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  // A select that opens the panel: hidden native <select> (keeps value + change handling) plus a visible button.
  function pickSelectHtml(id, optionsHtml, attrs, labelText){
    return '<select id="' + id + '" class="pn-native" tabindex="-1" aria-hidden="true"' + (attrs || '') + '>' + optionsHtml + '</select>' +
      '<button type="button" class="pn-pick" data-action="pick-option" data-for="' + id + '"><span>' + esc(labelText) + '</span>' + PN_CHEV + '</button>';
  }

  function panelEl(){ return document.getElementById('panelOverlay'); }
  function openPanel(title, bodyHtml){
    var o = panelEl(); if (!o) return;
    document.getElementById('panelTitle').textContent = title;
    document.getElementById('panelBody').innerHTML = bodyHtml;
    showSheetOverlay(o);
  }
  function closePanel(){
    var o = panelEl(); if (!o) return;
    clearInterval(PN.timer);
    hideSheetOverlay(o);
    PN.kind = null;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function pnTitleOf(label){ return String(label).split(' · ')[0]; }
  function pnDescFor(selId, value){
    if (selId === 'profActivity' || selId === 'wActivity') return ACTIVITY_DESC[value] || '';
    if (selId === 'profGoal') return (goalById(value) || {}).desc || '';
    return '';
  }

  function openOptionPanel(selId, btn){
    var sel = document.getElementById(selId); if (!sel) return;
    PN.kind = 'choice'; PN.sel = sel; PN.btn = btn || null;
    var rows = Array.prototype.map.call(sel.options, function(o){
      var on = o.value === sel.value, d = pnDescFor(selId, o.value);
      return '<button type="button" class="pn-opt' + (on ? ' on' : '') + '" data-action="panel-opt" data-v="' + esc(o.value) + '">' +
        '<span class="pn-opt-tx"><b>' + esc(pnTitleOf(o.textContent)) + '</b>' + (d ? '<small>' + esc(d) + '</small>' : '') + '</span>' +
        '<span class="pn-radio">' + (on ? '✓' : '') + '</span></button>';
    }).join('');
    openPanel(PANEL_TITLES[selId] || 'Choose', '<div class="pn-list">' + rows + '</div>');
  }

  function chooseOption(value){
    var sel = PN.sel; if (!sel) return;
    var opt = Array.prototype.filter.call(sel.options, function(o){ return o.value === value; })[0];
    if (!opt) return;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (PN.btn){ var sp = PN.btn.querySelector('span'); if (sp) sp.textContent = opt.textContent; }
    var rows = document.querySelectorAll('#panelBody .pn-opt');
    Array.prototype.forEach.call(rows, function(r){
      var on = r.getAttribute('data-v') === value;
      r.classList.toggle('on', on);
      r.querySelector('.pn-radio').textContent = on ? '✓' : '';
    });
    setTimeout(closePanel, prefersReducedMotion() ? 0 : 160);
  }

  /* ---- Weight ---- */
  function pnFmtWeight(v){ return String(Math.round(v * 10) / 10); }
  function openWeightPanel(){
    var imperial = STORE.appSettings.unit === 'imperial';
    PN.kind = 'weight'; PN.unit = imperial ? 'imperial' : 'metric';
    var v = imperial ? kgToLb(STORE.profile.weightKg) : STORE.profile.weightKg;
    openPanel('Your weight',
      '<div class="pn-weight">' +
        '<div class="pn-wrow"><button type="button" class="pn-step" data-step="-1" aria-label="Less">−</button>' +
          '<div class="pn-wmid"><input id="pnNum" class="pn-num" type="number" inputmode="decimal" step="0.1" value="' + pnFmtWeight(v) + '" aria-label="Weight">' +
          '<div class="pn-unit" id="pnUnitLabel">' + (imperial ? 'LB' : 'KG') + '</div></div>' +
          '<button type="button" class="pn-step" data-step="1" aria-label="More">+</button></div>' +
        '<div class="pn-chips"><button type="button" class="pn-chip' + (imperial ? '' : ' on') + '" data-action="panel-unit" data-u="metric">KG</button>' +
          '<button type="button" class="pn-chip' + (imperial ? ' on' : '') + '" data-action="panel-unit" data-u="imperial">LB</button></div>' +
        '<div class="pn-err" id="pnErr" role="alert"></div>' +
        '<div class="pn-hint">Your daily goals stay the same until you press Set my daily goals.</div>' +
        '<button type="button" class="btn-primary pn-save" data-action="panel-save">Save weight</button>' +
      '</div>');
  }
  function pnStepBy(dir){
    var inp = document.getElementById('pnNum'); if (!inp) return;
    var st = PN.unit === 'imperial' ? 0.2 : 0.1;
    var cur = parseFloat(inp.value); if (isNaN(cur)) cur = PN.unit === 'imperial' ? kgToLb(STORE.profile.weightKg) : STORE.profile.weightKg;
    inp.value = pnFmtWeight(Math.max(0, cur + dir * st));
    var e = document.getElementById('pnErr'); if (e) e.textContent = '';
  }
  function pnSetUnit(u){
    if (!PN.kind || u === PN.unit) return;
    var inp = document.getElementById('pnNum');
    var cur = parseFloat(inp.value);
    if (!isNaN(cur)) inp.value = pnFmtWeight(u === 'imperial' ? kgToLb(cur) : lbToKg(cur));
    PN.unit = u;
    document.getElementById('pnUnitLabel').textContent = u === 'imperial' ? 'LB' : 'KG';
    Array.prototype.forEach.call(document.querySelectorAll('#panelBody .pn-chip'), function(c){ c.classList.toggle('on', c.getAttribute('data-u') === u); });
  }
  function saveWeightPanel(){
    var inp = document.getElementById('pnNum'); if (!inp) return;
    var n = parseFloat(String(inp.value).replace(',', '.'));
    var kg = PN.unit === 'imperial' ? lbToKg(n) : n;
    var L = PLAN_LIMITS.weightKg;
    if (!(kg >= L[0] && kg <= L[1])){
      document.getElementById('pnErr').textContent = 'Weight should be between ' +
        (PN.unit === 'imperial' ? Math.ceil(kgToLb(L[0])) + ' and ' + Math.floor(kgToLb(L[1])) + ' lb' : L[0] + ' and ' + L[1] + ' kg') + '.';
      return;
    }
    STORE.profile.weightKg = Math.round(kg * 10) / 10;
    STORE.appSettings.unit = PN.unit;
    saveStore();
    closePanel();
    renderApp();
    showToast('Weight saved');
  }

  /* ---- Name ---- */
  function openNamePanel(){
    PN.kind = 'name';
    var cur = (STORE.appSettings.name || '').trim();
    openPanel('Your name',
      '<div class="pn-name"><div class="pn-sub">Shown on your profile and share card.</div>' +
        '<div class="pn-field"><input id="pnName" type="text" maxlength="24" value="' + esc(cur) + '" placeholder="Your name" autocomplete="off" autocapitalize="words">' +
        '<span class="pn-count" id="pnCount">' + cur.length + '/24</span></div>' +
        '<button type="button" class="btn-primary pn-save" data-action="panel-save">Save</button></div>');
    setTimeout(function(){ var i = document.getElementById('pnName'); if (i && PN.kind === 'name'){ i.focus(); i.select(); } }, prefersReducedMotion() ? 0 : 380);
  }
  function saveNamePanel(){
    var i = document.getElementById('pnName'); if (!i) return;
    STORE.appSettings.name = i.value.trim().slice(0, 24);
    saveStore();
    closePanel();
    renderApp();
  }

  document.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('[data-action]'); if (!el) return;
    var a = el.getAttribute('data-action');
    if (a === 'close-panel') closePanel();
    else if (a === 'pick-option') openOptionPanel(el.getAttribute('data-for'), el);
    else if (a === 'panel-opt') chooseOption(el.getAttribute('data-v'));
    else if (a === 'panel-unit') pnSetUnit(el.getAttribute('data-u'));
    else if (a === 'panel-save'){ if (PN.kind === 'weight') saveWeightPanel(); else if (PN.kind === 'name') saveNamePanel(); }
  });
  // hold + or - to keep stepping
  document.addEventListener('pointerdown', function(e){
    var b = e.target.closest && e.target.closest('.pn-step'); if (!b) return;
    var dir = parseInt(b.getAttribute('data-step'), 10);
    pnStepBy(dir);
    clearInterval(PN.timer);
    var t0 = setTimeout(function(){ PN.timer = setInterval(function(){ pnStepBy(dir); }, 70); }, 380);
    var stop = function(){ clearTimeout(t0); clearInterval(PN.timer); document.removeEventListener('pointerup', stop); document.removeEventListener('pointercancel', stop); };
    document.addEventListener('pointerup', stop); document.addEventListener('pointercancel', stop);
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && e.target && (e.target.id === 'pnNum' || e.target.id === 'pnName')){ e.preventDefault(); if (PN.kind === 'weight') saveWeightPanel(); else saveNamePanel(); }
    else if (e.key === 'Escape' && PN.kind) closePanel();
  });
  document.addEventListener('input', function(e){
    if (e.target && e.target.id === 'pnName'){ var c = document.getElementById('pnCount'); if (c) c.textContent = e.target.value.length + '/24'; }
    if (e.target && e.target.id === 'pnNum'){ var er = document.getElementById('pnErr'); if (er) er.textContent = ''; }
  });
  (function(){ var g = document.getElementById('panelGrab'); if (g) attachSheetDrag(g, closePanel); })();
