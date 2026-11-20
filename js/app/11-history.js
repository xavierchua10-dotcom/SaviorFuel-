  /* =========================================================
     RENDER — HISTORY TAB
     ========================================================= */
  // ---- Per-day numbers shared by History and Insights ----
  // Every day that has at least one meal, with its totals. Keys are
  // YYYY-MM-DD so they sort as dates.
  function dayStatsMap(){
    var map = {};
    STORE.meals.forEach(function(m){
      var k = dateKey(m.loggedAt);
      if (!map[k]) map[k] = { key: k, meals: [], calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
      var d = map[k];
      d.meals.push(m);
      d.calories += m.calories || 0;
      d.protein += m.protein || 0;
      d.carbs += m.carbs || 0;
      d.fat += m.fat || 0;
      d.fiber += m.fiber || 0;
    });
    return map;
  }

  // A day counts as "on goal" when calories land between 75% and 110%
  // of the goal; above that it is "over", below it is "low".
  function dayStatus(calories, goal){
    if (!goal || calories <= 0) return 'none';
    var p = calories / goal;
    if (p > 1.1) return 'over';
    if (p >= 0.75) return 'on';
    return 'low';
  }

  // Current logging streak (consecutive days with a meal, still alive if
  // today is empty but yesterday was logged) and the longest streak ever.
  function streakInfo(map){
    var keys = Object.keys(map).sort();
    var cur = 0, d = map[todayKey()] ? 0 : 1;
    while (map[dateKeyDaysAgo(d)]){ cur++; d++; }
    var best = 0, run = 0, prev = null;
    keys.forEach(function(k){
      if (prev && addDaysKey(prev, 1) === k) run++; else run = 1;
      if (run > best) best = run;
      prev = k;
    });
    return { current: cur, best: best };
  }

  var CHEV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';


  // ---- History: a month heat map up top, then the days of that month
  // (or every day matching the search). Rows stay slim; macros appear
  // only once a day is opened.
  function historyMonthKey(){
    var cur = todayKey().slice(0, 7);
    return (ui.histMonth && ui.histMonth <= cur) ? ui.histMonth : cur;
  }
  function addMonthKey(mk, n){
    var y = parseInt(mk.slice(0, 4), 10), m = parseInt(mk.slice(5, 7), 10) - 1 + n;
    var d = new Date(y, m, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function historyCalendarHtml(map, goal, mk){
    var y = parseInt(mk.slice(0, 4), 10), mo = parseInt(mk.slice(5, 7), 10) - 1;
    var daysIn = new Date(y, mo + 1, 0).getDate();
    var lead = (new Date(y, mo, 1).getDay() + 6) % 7; // Monday first
    var today = todayKey();
    var html = '<div class="hist-cal">' + ['M','T','W','T','F','S','S'].map(function(l){ return '<div class="hc-h">' + l + '</div>'; }).join('');
    for (var i = 0; i < lead; i++) html += '<div class="hc-blank"></div>';
    for (var d = 1; d <= daysIn; d++){
      var key = mk + '-' + String(d).padStart(2, '0');
      var info = map[key];
      var cls = 'hc-day';
      if (info) cls += ' ' + dayStatus(info.calories, goal);
      else if (key > today) cls += ' future';
      if (key === today) cls += ' now';
      html += info
        ? '<button type="button" class="' + cls + '" data-action="history-pick-day" data-day="' + key + '">' + d + '</button>'
        : '<div class="' + cls + '">' + d + '</div>';
    }
    html += '</div><div class="hist-legend"><span><i class="on"></i>On goal</span><span><i class="low"></i>Low</span><span><i class="over"></i>Over</span></div>';
    return html;
  }

  function historyDayHtml(day, goal, q){
    var key = day.key;
    var n = day.meals.length;
    var st = dayStatus(day.calories, goal);
    var pct = Math.min(100, pctUncapped(day.calories, goal));
    return '<div class="hist-item' + (key === todayKey() ? ' is-today' : '') + '" id="hd-' + key + '">' +
      '<div class="hist-item-head history-day-head" role="button" tabindex="0" data-action="open-day" data-day="' + key + '">' +
        '<div class="hist-item-main"><div class="hist-name">' + esc(formatDateLabel(key)) + '</div>' +
          '<div class="hist-sub">' + n + ' meal' + (n === 1 ? '' : 's') + '</div></div>' +
        '<div class="hist-item-side hist-kcal-col"><div class="hist-kcal">' + Math.round(day.calories).toLocaleString() + '<small>' + (goal > 0 ? '/ ' + Math.round(goal).toLocaleString() + ' kcal' : 'kcal') + '</small></div>' +
          '<div class="hist-pb ' + st + '"><i style="width:' + pct + '%"></i></div></div>' +
      '</div>' +
      (q ? '<div class="hist-hits">' + day.meals.filter(function(m){ return String(m.name || '').toLowerCase().indexOf(q) !== -1; }).slice(0, 3).map(function(m){
        return '<span class="hist-hit">' + esc(tidyName(m.name)) + ' \u00B7 ' + Math.round(m.calories) + '</span>'; }).join('') + '</div>' : '') +
    '</div>';
  }

  /* ---- Full-screen day (like SaviorFit Logger's workout detail) ----
     Opens from a timeline row, a week-strip day or the calendar. A hero with
     the day's calories vs goal, three macro cards, the meals by category and
     a bar to copy the whole day to today. Re-drawn by renderApp() so edits,
     deletes and copies show up straight away. */
  function dayHeroName(key){
    var t = formatDateLabel(key);
    if (t === 'Today' || t === 'Yesterday') return t;
    return new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' });
  }
  function dayMealCardHtml(m){
    return '<div class="dy-meal" data-action="edit-meal" data-id="' + m.id + '">' +
      '<i class="dy-dot"></i>' +
      '<div class="dy-meal-main"><div class="dy-meal-name">' + esc(tidyName(m.name)) + '</div>' +
        '<div class="dy-meal-macros">P' + (m.protein || 0) + ' · C' + (m.carbs || 0) + ' · F' + (m.fat || 0) + '</div></div>' +
      '<div class="dy-meal-kcal">' + m.calories + '<small>kcal</small></div>' +
      '<button type="button" class="dy-more" data-action="day-meal-menu" data-id="' + m.id + '" aria-label="Options for ' + esc(m.name) + '">&#8943;</button>' +
    '</div>';
  }
  function dayOverlayInner(key){
    var meals = mealsForDay(key).slice().sort(function(a, b){ return b.loggedAt - a.loggedAt; });
    var goals = STORE.goals;
    var t = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    meals.forEach(function(m){ t.calories += m.calories || 0; t.protein += m.protein || 0; t.carbs += m.carbs || 0; t.fat += m.fat || 0; });
    var st = dayStatus(t.calories, goals.calories);
    var stLabel = st === 'on' ? 'ON GOAL' : st === 'over' ? 'OVER' : 'LOW';
    var dateMono = new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '').toUpperCase();
    function macro(label, v, g, col){
      var w = g ? Math.min(100, Math.round(v / g * 100)) : 0;
      return '<div class="dy-macro"><div class="dy-macro-v">' + Math.round(v) + '<small>g</small></div><div class="dy-macro-l">' + label + '</div>' +
        '<div class="dy-macro-bar"><i style="width:' + w + '%;background:' + col + '"></i></div></div>';
    }
    var buckets = {}, other = [];
    MEAL_CATEGORIES.forEach(function(c){ buckets[c.id] = []; });
    meals.forEach(function(m){ if (m.category && buckets[m.category]) buckets[m.category].push(m); else other.push(m); });
    var list = '';
    MEAL_CATEGORIES.forEach(function(c){
      if (buckets[c.id].length) list += '<div class="dy-cat">' + c.label + '</div>' + buckets[c.id].map(dayMealCardHtml).join('');
    });
    if (other.length) list += '<div class="dy-cat">Other</div>' + other.map(dayMealCardHtml).join('');
    var pct = Math.min(100, pctUncapped(t.calories, goals.calories));
    return '<div class="dy-scroll">' +
      '<div class="dy-hero"><button type="button" class="dy-x" data-action="close-day" aria-label="Close">&times;</button>' +
        '<div class="dy-date">' + esc(dateMono) + '</div><h2 class="dy-name">' + esc(dayHeroName(key)) + '</h2>' +
        '<div class="dy-hero-row"><div><div class="dy-big">' + Math.round(t.calories).toLocaleString() + '<small>/ ' + Math.round(goals.calories).toLocaleString() + ' kcal</small></div>' +
          '<div class="dy-big-l">CALORIES</div></div><span class="dy-tag ' + st + '">' + stLabel + '</span></div>' +
        '<div class="dy-goalbar ' + st + '"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="dy-macros">' + macro('PROTEIN', t.protein, goals.protein, 'var(--c-protein)') + macro('CARBS', t.carbs, goals.carbs, 'var(--c-carbs)') + macro('FAT', t.fat, goals.fat, 'var(--c-fat)') + '</div>' +
      list + '</div>' +
      (key !== todayKey() ? '<div class="dy-bar"><button type="button" class="dy-copy" data-action="copy-day" data-day="' + key + '">Copy day to today</button></div>' : '');
  }
  function openDayOverlay(key){
    closeDayOverlay();
    if (!mealsForDay(key).length) return;
    ui.dayOpen = key;
    var el = document.createElement('div');
    el.id = 'dayOverlay'; el.className = 'day-overlay dy-in';
    el.innerHTML = dayOverlayInner(key);
    document.getElementById('app').appendChild(el);
    attachDaySwipe(el);
  }
  // Swipe the day panel down to dismiss. Only takes over once the list is
  // scrolled to the top and the finger is clearly moving down, so normal
  // scrolling is untouched.
  function attachDaySwipe(el){
    var sx = 0, sy = 0, st = 0, dy = 0, mode = 0; // mode: 0 idle, 1 undecided, 2 dragging, 3 ignore
    el.addEventListener('touchstart', function(e){
      if (e.touches.length !== 1){ mode = 3; return; }
      var sc = el.querySelector('.dy-scroll');
      mode = (sc && sc.scrollTop > 0) ? 3 : 1;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); dy = 0;
    }, { passive: true });
    el.addEventListener('touchmove', function(e){
      if (mode === 0 || mode === 3) return;
      var t = e.touches[0], mx = t.clientX - sx;
      dy = t.clientY - sy;
      if (mode === 1){
        if (Math.abs(dy) < 8 && Math.abs(mx) < 8) return;
        if (dy > 0 && Math.abs(dy) > Math.abs(mx)){ mode = 2; el.style.transition = 'none'; el.style.animation = 'none'; }
        else { mode = 3; return; }
      }
      e.preventDefault();
      var d = Math.max(0, dy);
      el.style.transform = 'translateY(' + d + 'px)';
      el.style.opacity = String(Math.max(0.4, 1 - d / 600));
    }, { passive: false });
    function end(){
      if (mode !== 2){ mode = 0; return; }
      mode = 0;
      var fast = dy / Math.max(1, Date.now() - st) > 0.6;
      if (dy > 110 || (fast && dy > 40)){
        el.style.transition = 'transform .2s ease-out, opacity .2s';
        el.style.transform = 'translateY(100%)'; el.style.opacity = '0';
        setTimeout(function(){ if (document.getElementById('dayOverlay') === el) closeDayOverlay(); }, prefersReducedMotion() ? 0 : 200);
      } else {
        el.style.transition = 'transform .2s ease-out, opacity .2s';
        el.style.transform = ''; el.style.opacity = '';
        setTimeout(function(){ el.style.transition = ''; el.style.animation = ''; }, 220);
      }
    }
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }
  function closeDayOverlay(){
    ui.dayOpen = null;
    var el = document.getElementById('dayOverlay');
    if (el) el.remove();
  }
  function refreshDayOverlay(){
    if (!ui.dayOpen) return;
    var el = document.getElementById('dayOverlay');
    if (!el) return;
    if (!mealsForDay(ui.dayOpen).length){ closeDayOverlay(); return; }
    var sc = el.querySelector('.dy-scroll'), top = sc ? sc.scrollTop : 0;
    el.classList.remove('dy-in');
    el.innerHTML = dayOverlayInner(ui.dayOpen);
    var sc2 = el.querySelector('.dy-scroll'); if (sc2) sc2.scrollTop = top;
  }

  // The "..." on a meal card: edit / copy to today / delete.
  function openMealMenu(id){
    var m = mealById(id);
    if (!m) return;
    closeMealMenu();
    var el = document.createElement('div');
    el.className = 'stats-sheet'; el.id = 'mealMenu';
    el.innerHTML = '<div class="stats-sheet-card"><div class="stats-sheet-head"><h3>' + esc(tidyName(m.name)) + '</h3>' +
      '<button type="button" class="stats-sheet-x" data-action="close-meal-menu" aria-label="Close">&times;</button></div>' +
      '<button type="button" class="dm-opt" data-action="menu-edit" data-id="' + id + '">Edit</button>' +
      (dateKey(m.loggedAt) !== todayKey() ? '<button type="button" class="dm-opt" data-action="menu-copy" data-id="' + id + '">Copy to today</button>' : '') +
      '<button type="button" class="dm-opt danger" data-action="menu-delete" data-id="' + id + '">Delete</button></div>';
    el.addEventListener('click', function(e){ if (e.target === el) closeMealMenu(); });
    document.body.appendChild(el);
  }
  function closeMealMenu(){
    var el = document.getElementById('mealMenu');
    if (el) el.remove();
  }

  // The days, newest first, under a green month label. Shows a page at a
  // time (ui.histShow); "Show earlier" adds more.
  function historyKeysSorted(map){ return Object.keys(map).sort().reverse(); }
  function historyListHtml(map, goal){
    var q = (ui.histQuery || '').trim().toLowerCase();
    var keys = historyKeysSorted(map);
    if (q){
      keys = keys.filter(function(k){
        return map[k].meals.some(function(m){ return String(m.name || '').toLowerCase().indexOf(q) !== -1; });
      });
      if (!keys.length) return '<div class="hist-none">No days with \u201c' + esc(ui.histQuery.trim()) + '\u201d.</div>';
    }
    var shown = q ? keys.slice(0, 60) : keys.slice(0, ui.histShow || 21);
    var html = q ? '<div class="hist-count">' + keys.length + ' day' + (keys.length === 1 ? '' : 's') + ' with \u201c' + esc(ui.histQuery.trim()) + '\u201d</div>' : '', lastMonth = '';
    shown.forEach(function(k){
      var mk = k.slice(0, 7);
      if (!q && mk !== lastMonth){
        lastMonth = mk;
        var d = new Date(mk + '-01T00:00:00');
        var lab = d.toLocaleDateString(undefined, { month: 'long', year: mk.slice(0, 4) === todayKey().slice(0, 4) ? undefined : 'numeric' });
        html += '<div class="hist-mlabel">' + esc(lab) + '</div>';
      }
      html += historyDayHtml(map[k], goal, q);
    });
    if (!q && keys.length > shown.length) html += '<button type="button" class="hist-more" data-action="history-more">Show earlier</button>';
    return html;
  }

  // Monday-to-Sunday strip for the current week, each day a small progress ring.
  function historyStripHtml(map, goal){
    var today = todayKey();
    var dow = (new Date().getDay() + 6) % 7; // Monday = 0
    var letters = ['M','T','W','T','F','S','S'];
    var cells = '', sum = 0, n = 0, under = 0;
    for (var i = 0; i < 7; i++){
      var key = dateKeyDaysAgo(dow - i);
      var info = map[key];
      var cls = 'hs-day';
      if (key === today) cls += ' now';
      if (key > today) cls += ' future';
      var ring = '';
      if (info){
        var st = dayStatus(info.calories, goal);
        ring = '<i class="hs-ring ' + st + '" style="--p:' + Math.min(100, pctUncapped(info.calories, goal)) + '"></i>';
        sum += info.calories; n++;
      } else if (key > today){
        ring = '<i class="hs-ring none"></i>';
      } else {
        ring = '<i class="hs-ring empty"></i>';
      }
      if (info && key <= today && dayStatus(info.calories, goal) !== 'over' && info.calories > 0 && goal > 0) under++;
      var inner = '<span class="hs-w">' + letters[i] + '</span><span class="hs-n">' + parseInt(key.slice(8, 10), 10) + '</span>' + ring;
      cells += info
        ? '<button type="button" class="' + cls + '" data-action="history-pick-day" data-day="' + key + '">' + inner + '</button>'
        : '<div class="' + cls + '">' + inner + '</div>';
    }
    var avg = n ? Math.round(sum / n).toLocaleString() + ' kcal/day' : 'nothing logged yet';
    var line = n ? n + (n === 1 ? ' day' : ' days') + ' logged' + (goal > 0 ? ' \u00B7 ' + under + ' within goal' : '') : 'Log a meal to start your week.';
    return '<div class="hist-sec"><span>This week</span><em>' + avg + '</em></div><div class="hist-strip">' + cells + '</div>' +
      '<div class="hist-week-note">' + line + '</div>';
  }

  function renderHistory(){
    if (STORE.meals.length === 0){
      document.getElementById('view').innerHTML =
        '<div class="empty tab-empty-state"><div class="glyph">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M3 17l6-6 4 4 8-8"></path><path d="M15 7h6v6"></path>' +
          '</svg></div><p>No meal history yet.<br>Logged meals will show up here.</p></div>';
      return;
    }
    var goal = STORE.goals.calories;
    var map = dayStatsMap();
    var findOpen = !!(ui.histFind || (ui.histQuery || '').trim());
    var findIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    var calIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="3"></rect><line x1="3" y1="10" x2="21" y2="10"></line><line x1="8" y1="2.5" x2="8" y2="6.5"></line><line x1="16" y1="2.5" x2="16" y2="6.5"></line></svg>';
    document.getElementById('view').innerHTML =
      '<div class="hist-head"><h2 class="hist-title">History</h2>' +
        '<div class="hist-btns"><button type="button" class="hist-find-btn' + (findOpen ? ' on' : '') + '" data-action="toggle-hist-find" aria-label="Filter by food" aria-expanded="' + findOpen + '">' + findIcon + '</button>' +
        '<button type="button" class="hist-cal-btn" data-action="open-calendar">' + calIcon + 'Calendar</button></div></div>' +
      historyStripHtml(map, goal) +
      (findOpen ? '<div class="hist-find"><input type="search" class="hist-search" id="histSearch" placeholder="Filter by food, e.g. laksa" autocomplete="off" value="' + esc(ui.histQuery || '') + '">' +
        '<button type="button" class="food-search-clear hist-find-x" data-action="toggle-hist-find" aria-label="Close filter">&times;</button></div>' : '') +
      '<div id="histList">' + historyListHtml(map, goal) + '</div>';
  }

  // Full-month calendar, opened from the Calendar button.
  function calendarSheetInner(){
    var map = dayStatsMap(), goal = STORE.goals.calories, mk = historyMonthKey();
    var monthLabel = new Date(mk + '-01T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    var atNow = mk === todayKey().slice(0, 7);
    return '<div class="stats-sheet-card"><div class="stats-sheet-head"><h3>' + esc(monthLabel) + '</h3>' +
        '<div class="hist-month-nav"><button type="button" data-action="cal-month" data-dir="-1" aria-label="Previous month">‹</button>' +
        '<button type="button" data-action="cal-month" data-dir="1" aria-label="Next month"' + (atNow ? ' disabled' : '') + '>›</button>' +
        '<button type="button" class="stats-sheet-x" data-action="close-calendar" aria-label="Close">&times;</button></div></div>' +
      '<div style="height:10px"></div>' + historyCalendarHtml(map, goal, mk) + '</div>';
  }
  function openCalendarSheet(){
    closeCalendarSheet();
    var el = document.createElement('div');
    el.className = 'stats-sheet'; el.id = 'calSheet';
    el.innerHTML = calendarSheetInner();
    el.addEventListener('click', function(e){ if (e.target === el) closeCalendarSheet(); });
    document.body.appendChild(el);
  }
  function closeCalendarSheet(){
    var el = document.getElementById('calSheet');
    if (el) el.remove();
  }

  // Copies every meal of a past day onto today.
  function copyDayToToday(key){
    var meals = mealsForDay(key);
    if (!meals.length) return;
    var now = Date.now();
    meals.forEach(function(m, i){
      STORE.meals.push(Object.assign({}, m, {
        id: 'm_' + now + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
        loggedAt: now + i
      }));
    });
    saveStore();
    maybeVibrate();
    renderApp();
    showToast('Copied ' + meals.length + ' meal' + (meals.length === 1 ? '' : 's') + ' to today');
  }

