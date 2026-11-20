  // ---- Weekly Overview, plain: the bars, week numbers, average macros,
  // calorie split and consistency line.
  // Top foods card (moved here from Profile).
  function topFoodsCardHtml(){
    var ps = profileStatsFuel();
    var h = '<div class="card pf-top"><div class="pf-top-h">TOP FOODS</div>';
    if (ps.top.length){
      ps.top.forEach(function(f){
        h += '<div class="pf-food"><div class="pf-food-n">' + esc(f.name) + '</div><div class="pf-food-v">' + f.n + '<small> \u00D7</small></div></div>';
      });
    } else {
      h += '<div class="pf-empty">Log a few meals and the foods you eat most show up here.</div>';
    }
    return h + '</div>';
  }

  // ---- By meal: the day's (or week's) calories split across Breakfast,
  // Morning Snacks, Lunch, Evening Snacks and Dinner, with each meal's
  // own protein / carbs / fat. A switch flips Today <-> last 7 days.
  var MEAL_COLORS = { 'breakfast': '#f2a33a', 'morning-snack': '#8bc34a', 'lunch': '#26a69a', 'evening-snack': '#7e8ce0', 'dinner': '#c0568f', 'other': '#9aa3ad' };
  function mealSplitData(range){
    var keys = {};
    for (var d = 0; d < (range === 'week' ? 7 : 1); d++) keys[dateKeyDaysAgo(d)] = 1;
    var rows = MEAL_CATEGORIES.map(function(c){ return { id: c.id, label: c.label, n: 0, cal: 0, p: 0, c: 0, f: 0 }; });
    var other = { id: 'other', label: 'Other', n: 0, cal: 0, p: 0, c: 0, f: 0 };
    STORE.meals.forEach(function(m){
      if (!keys[dateKey(m.loggedAt)]) return;
      var r = rows.filter(function(x){ return x.id === m.category; })[0] || other;
      r.n++; r.cal += m.calories || 0; r.p += m.protein || 0; r.c += m.carbs || 0; r.f += m.fat || 0;
    });
    if (other.n) rows.push(other);
    return rows;
  }
  // Each meal's share of the daily goals (percent). Editable in My plan.
  var DEFAULT_MEAL_SPLIT = { 'breakfast': 25, 'morning-snack': 10, 'lunch': 30, 'evening-snack': 10, 'dinner': 25 };
  function mealSplitPcts(){
    var u = STORE.appSettings.mealSplit || {}, out = {};
    MEAL_CATEGORIES.forEach(function(c){
      out[c.id] = (typeof u[c.id] === 'number' && u[c.id] >= 0 && u[c.id] <= 100) ? u[c.id] : DEFAULT_MEAL_SPLIT[c.id];
    });
    return out;
  }
  function mealTarget(id, mult){
    var g = STORE.goals, pc = (mealSplitPcts()[id] || 0) / 100, m = mult || 1;
    return { cal: Math.round(g.calories * pc * m), p: Math.round(g.protein * pc * m), c: Math.round(g.carbs * pc * m), f: Math.round(g.fat * pc * m) };
  }

  function mealSplitCardHtml(){
    var range = ui.mealSplit === 'week' ? 'week' : 'today';
    var mult = range === 'week' ? 7 : 1;
    var rows = mealSplitData(range);
    var total = rows.reduce(function(a, r){ return a + r.cal; }, 0);
    var goalCal = STORE.goals.calories * mult;
    var bar = rows.filter(function(r){ return r.cal > 0; }).map(function(r){
      return '<i style="width:' + (r.cal / total * 100).toFixed(1) + '%;background:' + MEAL_COLORS[r.id] + '"></i>';
    }).join('');
    function mc(cls, l, v, t){
      var over = t != null && t > 0 && Math.round(v) > t;
      return '<span class="' + (over ? 'ov' : cls) + '">' + l + ' ' + Math.round(v) + (t != null ? '/' + t : '') + 'g</span>';
    }
    var list = rows.map(function(r){
      var t = r.id === 'other' ? null : mealTarget(r.id, mult);
      var dot = '<i class="dot" style="background:' + MEAL_COLORS[r.id] + '"></i>';
      if (r.n === 0){
        return '<div class="bm-row2 none"><div class="bm-top">' + dot + '<div class="nm">' + r.label + '<small>nothing logged</small></div>' +
          '<div class="kc">0<small> / ' + t.cal.toLocaleString() + ' kcal</small></div></div>' +
          '<div class="bm-prog"><i style="width:0"></i></div>' +
          '<div class="bm-mx2">' + mc('p', 'P', 0, t.p) + mc('c', 'C', 0, t.c) + mc('f', 'F', 0, t.f) + '</div></div>';
      }
      var over = t && r.cal > t.cal;
      return '<div class="bm-row2">' +
        '<div class="bm-top">' + dot + '<div class="nm">' + r.label + '<small>' + r.n + (r.n === 1 ? ' food' : ' foods') + '</small></div>' +
          '<div class="kc' + (over ? ' over' : '') + '">' + Math.round(r.cal).toLocaleString() + '<small>' + (t ? ' / ' + t.cal.toLocaleString() + ' kcal' : ' kcal') + '</small></div></div>' +
        (t ? '<div class="bm-prog"><i style="width:' + Math.min(100, t.cal > 0 ? r.cal / t.cal * 100 : 0).toFixed(0) + '%;background:' + (over ? 'var(--accent-2)' : MEAL_COLORS[r.id]) + '"></i></div>' : '<div class="bm-gap2"></div>') +
        '<div class="bm-mx2">' + mc('p', 'P', r.p, t && t.p) + mc('c', 'C', r.c, t && t.c) + mc('f', 'F', r.f, t && t.f) + '</div></div>';
    }).join('');
    return '<div class="card bm-card" id="mealSplitCard"><div class="bm-h"><span>By meal</span>' +
        '<div class="bm-seg"><button type="button" data-action="meal-split-range" data-range="today" class="' + (range === 'today' ? 'on' : '') + '">TODAY</button>' +
        '<button type="button" data-action="meal-split-range" data-range="week" class="' + (range === 'week' ? 'on' : '') + '">7 DAYS</button></div></div>' +
      '<div class="bm-tot"><b>' + Math.round(total).toLocaleString() + ' kcal</b><small>' + (goalCal > 0 ? 'of ' + goalCal.toLocaleString() + (range === 'week' ? ' weekly goal' : ' daily goal') : '') + '</small></div>' +
      '<div class="bm-stack">' + bar + '</div><div class="bm-gap"></div>' + list + '</div>';
  }

  // My plan > Meal split: how the daily goals are shared across meals.
  function mealSplitBoxHtml(){
    var pcts = mealSplitPcts(), sum = 0;
    var rows = MEAL_CATEGORIES.map(function(c){
      var pc = pcts[c.id]; sum += pc;
      var t = mealTarget(c.id, 1);
      return '<div class="ms-row"><i class="dot" style="background:' + MEAL_COLORS[c.id] + '"></i>' +
        '<div class="nm">' + c.label + '<small>' + t.cal + ' kcal · P' + t.p + ' C' + t.c + ' F' + t.f + '</small></div>' +
        '<div class="ms-step"><button type="button" data-action="meal-split-step" data-id="' + c.id + '" data-d="-5" aria-label="Less ' + c.label + '"' + (pc <= 0 ? ' disabled' : '') + '>−</button>' +
        '<b>' + pc + '%</b>' +
        '<button type="button" data-action="meal-split-step" data-id="' + c.id + '" data-d="5" aria-label="More ' + c.label + '"' + (pc >= 100 ? ' disabled' : '') + '>+</button></div></div>';
    }).join('');
    var ok = sum === 100;
    return '<div class="ms-box" id="mealSplitBox"><div class="ms-h">Meal split</div><div class="ms-sub">How your daily goals are shared across meals.</div>' + rows +
      '<div class="ms-tot' + (ok ? '' : ' bad') + '">Total<span>' + (ok ? '100% ✓' : sum + '% — should be 100%') + '</span></div>' +
      '<button type="button" class="ms-reset" data-action="meal-split-reset">Reset to default</button></div>';
  }

  function weeklyBodyHtml(){
    var wd = weekData();
    var g = wd.goals, days = wd.days, loggedDays = wd.loggedDays, avg = wd.avg, sum = wd.sum;
    var DAYS_TO_SHOW = 7;
    var dayMax = Math.max(g.calories, Math.max.apply(null, days.map(function(x){ return x.total; })), 1);
    var goalPos = pct(g.calories, dayMax); // where the goal line sits along each bar

    var html = (loggedDays.length ? mealSplitCardHtml() : '') + '<div class="card wk-card"><div class="wk-h"><span>This week</span>' + (g.calories > 0 ? '<em>Goal ' + g.calories.toLocaleString() + '</em>' : '') + '</div>';
    html += days.map(function(x){
      return '<div class="insight-bar-row">' +
        '<div class="insight-bar-day">' + x.label + '</div>' +
        '<div class="insight-bar-track">' +
          '<div class="insight-bar-fill' + (x.isToday ? ' today' : '') + (g.calories > 0 && x.total > g.calories ? ' over' : '') + '" style="width:' + pct(x.total, dayMax) + '%"></div>' +
          (g.calories > 0 ? '<i class="insight-goal-mark" style="left:' + goalPos + '%"></i>' : '') +
        '</div>' +
        '<div class="insight-bar-val">' + x.total + '</div>' +
      '</div>';
    }).join('');
    if (loggedDays.length === 0){
      return html + '<div class="insight-caption">Log a meal to see your weekly averages and macro split.</div></div>' + topFoodsCardHtml();
    }

    // ---- where the week's calories came from (4 kcal/g protein & carbs, 9 kcal/g fat)
    var pKcal = sum.protein * 4, cKcal = sum.carbs * 4, fKcal = sum.fat * 9;
    var macroKcal = pKcal + cKcal + fKcal;
    if (macroKcal > 0){
      var pP = Math.round(pKcal / macroKcal * 100);
      var pC = Math.round(cKcal / macroKcal * 100);
      var pF = Math.max(0, 100 - pP - pC); // so the three always add to 100
      html += '<div class="wk-div"></div><div class="wk-h"><span>Where it came from</span></div>' +
        '<div class="split-bar"><i class="p" style="width:' + pP + '%"></i><i class="c" style="width:' + pC + '%"></i><i class="f" style="width:' + pF + '%"></i></div>' +
        '<div class="split-legend">' +
          '<span><i class="p"></i>Protein <b>' + pP + '%</b></span>' +
          '<span><i class="c"></i>Carbs <b>' + pC + '%</b></span>' +
          '<span><i class="f"></i>Fat <b>' + pF + '%</b></span>' +
        '</div>';
    }

    html += '</div>' + topFoodsCardHtml();
    html += '<button type="button" class="week-share-btn" data-action="share-week">Share my week</button>';
    return html;
  }

  /* =========================================================
     RENDER — SETTINGS TAB
     ========================================================= */

  function settingsGoalRow(label, id, value){
    return '<div class="settings-goal-row"><label>' + label + '</label>' +
      '<input type="number" inputmode="numeric" id="' + id + '" value="' + value + '" data-action-change="save-goal">' +
    '</div>';
  }

  function saveGoalsFromInputs(){
    // A goal can be 0 (e.g. no sugar target); only blank or invalid falls back to the default.
    var read = function(id, def, min, max){
      var v = parseInt(document.getElementById(id).value, 10);
      return (isFinite(v) && v >= (min || 0)) ? Math.min(v, max || 20000) : def;
    };
    STORE.goals = {
      calories: read('goalCalories', DEFAULT_GOALS.calories, 1, 10000),
      protein: read('goalProtein', DEFAULT_GOALS.protein, 0, 2000),
      carbs: read('goalCarbs', DEFAULT_GOALS.carbs, 0, 2000),
      fat: read('goalFat', DEFAULT_GOALS.fat, 0, 2000),
      sugar: read('goalSugar', DEFAULT_GOALS.sugar),
      sodium: read('goalSodium', DEFAULT_GOALS.sodium),
      water: read('goalWater', DEFAULT_GOALS.water)
    };
    saveStore();
  }

  /* =========================================================
     PLAN CALCULATOR — Mifflin-St Jeor BMR -> TDEE -> goal-adjusted
     calories -> macro split. Standard formula used by most
     fitness/nutrition apps; not medical advice, just a starting
     estimate the person can always override manually below.
     ========================================================= */
  function selectOptionsHtml(options, selectedId){
    return options.map(function(o){
      return '<option value="' + o.id + '"' + (o.id === selectedId ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
  }

  function profileFormHtml(){
    var p = STORE.profile;
    var imperial = STORE.appSettings.unit === 'imperial';
    var heightVal = imperial ? Math.round(cmToIn(p.heightCm)) : p.heightCm;
    var weightVal = imperial ? Math.round(kgToLb(p.weightKg) * 10) / 10 : p.weightKg;
    var chg = ' data-action-change="save-profile"';
    return '<div class="settings-section"><div class="plan-h">Your details</div><div class="card">' +
      '<div class="settings-goal-row"><label for="profSex">Sex</label>' +
        pickSelectHtml('profSex', '<option value="male"' + (p.sex === 'male' ? ' selected' : '') + '>Male</option>' +
          '<option value="female"' + (p.sex === 'female' ? ' selected' : '') + '>Female</option>', chg, p.sex === 'female' ? 'Female' : 'Male') +
      '</div>' +
      '<div class="settings-goal-row"><label for="profAge">Age</label>' +
        '<input type="number" inputmode="numeric" id="profAge" min="10" max="100" value="' + p.age + '"' + chg + '></div>' +
      '<div class="settings-goal-row"><label for="profHeight">Height (' + (imperial ? 'in' : 'cm') + ')</label>' +
        '<input type="number" inputmode="numeric" id="profHeight" value="' + heightVal + '"' + chg + '></div>' +
      '<div class="settings-goal-row"><label for="profWeight">Bodyweight (' + (imperial ? 'lb' : 'kg') + ')</label>' +
        '<input type="number" inputmode="decimal" id="profWeight" value="' + weightVal + '"' + chg + '></div>' +
      '<div class="settings-goal-row"><label for="profActivity">Activity level</label>' +
        pickSelectHtml('profActivity', selectOptionsHtml(ACTIVITY_LEVELS, p.activityLevel), chg, (ACTIVITY_LEVELS.filter(function(a){ return a.id === p.activityLevel; })[0] || ACTIVITY_LEVELS[2]).label) +
      '</div>' +
      '<div class="settings-goal-row"><label for="profGoal">Goal</label>' +
        pickSelectHtml('profGoal', selectOptionsHtml(GOAL_OPTIONS, p.goal), chg, goalById(p.goal).label) +
      '</div>' +
      '<div class="plan-hint" id="profGoalDesc">' + esc(goalById(p.goal).desc) + '</div>' +
      '<button class="btn-primary" data-action="calculate-plan" style="margin-top:10px;">Set my daily goals</button>' +
      '<div class="plan-hint centre">Works out calories and macros from your details. You can still change any number below.</div>' +
    '</div></div>';
  }

  // Mifflin-St Jeor plan from a profile (weightKg / heightCm / age / sex /
  // activityLevel / goal). Used by Settings > "Calculate my plan" and the
  // first-run welcome.
  function computePlan(profile){
    var bmr = profile.sex === 'male'
      ? (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.age) + 5
      : (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.age) - 161;
    var activityMult = (ACTIVITY_LEVELS.find(function(a){ return a.id === profile.activityLevel; }) || ACTIVITY_LEVELS[2]).mult;
    var tdee = bmr * activityMult;
    var goal = goalById(profile.goal);
    // Safety floor so a small person on "Lose weight" never lands on a crash diet.
    var floor = profile.sex === 'male' ? 1500 : 1200;
    var calories = Math.max(floor, Math.round(tdee * (1 + goal.pct)));
    // Protein by bodyweight (depends on the goal), fat at 25% of calories, carbs fill the rest.
    var protein = Math.round(profile.weightKg * goal.protein);
    var fatCal = calories * 0.25;
    var fat = Math.round(fatCal / 9);
    var carbs = Math.round(Math.max(0, calories - protein * 4 - fatCal) / 4);
    return { tdee: tdee, calories: calories, protein: protein, carbs: carbs, fat: fat };
  }

  // Reads the body-details form. Returns { profile, err } — err is a plain
  // sentence when something is blank or out of range, so nothing silly
  // (a -5 kg weight, a 300-year-old) ever reaches the plan.
  function readProfileForm(){
    var imperial = STORE.appSettings.unit === 'imperial';
    var v = function(id){ return document.getElementById(id).value; };
    var age = parseInt(v('profAge'), 10), h = parseFloat(v('profHeight')), w = parseFloat(v('profWeight'));
    var hCm = imperial ? inToCm(h) : h, wKg = imperial ? lbToKg(w) : w;
    var L = PLAN_LIMITS, err = null;
    if (!(age >= L.age[0] && age <= L.age[1])) err = 'Age should be between ' + L.age[0] + ' and ' + L.age[1] + '.';
    else if (!(hCm >= L.heightCm[0] && hCm <= L.heightCm[1])) err = 'Height should be between ' + (imperial ? Math.ceil(cmToIn(L.heightCm[0])) + ' and ' + Math.floor(cmToIn(L.heightCm[1])) + ' in' : L.heightCm[0] + ' and ' + L.heightCm[1] + ' cm') + '.';
    else if (!(wKg >= L.weightKg[0] && wKg <= L.weightKg[1])) err = 'Bodyweight should be between ' + (imperial ? Math.ceil(kgToLb(L.weightKg[0])) + ' and ' + Math.floor(kgToLb(L.weightKg[1])) + ' lb' : L.weightKg[0] + ' and ' + L.weightKg[1] + ' kg') + '.';
    return {
      err: err,
      profile: err ? null : { sex: v('profSex'), age: age, heightCm: Math.round(hCm), weightKg: Math.round(wKg * 10) / 10, activityLevel: v('profActivity'), goal: v('profGoal') }
    };
  }

  // Body details save as soon as you change them (no need to press Calculate
  // just to keep them); Calculate is only for turning them into daily goals.
  function saveProfileFromForm(){
    if (!document.getElementById('profWeight')) return;
    var r = readProfileForm();
    if (r.err){ showToast(r.err); return; }
    var wChanged = r.profile.weightKg !== STORE.profile.weightKg;
    STORE.profile = r.profile;
    if (wChanged) recordWeight(r.profile.weightKg);
    saveStore();
  }

  function calculatePlanFromForm(){
    var r = readProfileForm();
    if (r.err){ showToast(r.err); return; }
    var prevGoals = Object.assign({}, STORE.goals), prevTdee = STORE.lastPlanTdee, prevBase = STORE.goalsWeightKg;
    STORE.profile = r.profile;
    STORE.goalsWeightKg = r.profile.weightKg;
    recordWeight(r.profile.weightKg);
    var plan = computePlan(r.profile);
    // Merge rather than replace — the calculator only derives calories and
    // protein/carbs/fat, so sugar/sodium/water goals carry over.
    STORE.goals = Object.assign({}, STORE.goals, { calories: plan.calories, protein: plan.protein, carbs: plan.carbs, fat: plan.fat });
    STORE.lastPlanTdee = Math.round(plan.tdee);
    saveStore();
    renderApp();
    showToast('Daily goals set: ' + plan.calories + ' kcal', 'Undo', function(){
      STORE.goals = prevGoals; STORE.lastPlanTdee = prevTdee; STORE.goalsWeightKg = prevBase; saveStore(); renderApp();
    });
  }

  // One collapsible settings card: icon + title + one-line summary, and
  // the real controls open underneath when tapped. Only one is open at a
  // time (ui.settingsOpen).
  function settingsCardHtml(id, iconSvg, title, desc, body){
    var open = ui.settingsOpen === id;
    return '<div class="setc-wrap' + (open ? ' open' : '') + '" id="setc-' + id + '">' +
      '<div class="setc" role="button" tabindex="0" data-action="toggle-settings-sec" data-sec="' + id + '">' +
        '<span class="setc-ic">' + iconSvg + '</span>' +
        '<span class="setc-tx"><span class="setc-t">' + title + '</span><span class="setc-d">' + desc + '</span></span>' +
        '<span class="hist-chev">' + CHEV_SVG + '</span>' +
      '</div>' +
      (open ? '<div class="setc-body">' + body + '</div>' : '') +
    '</div>';
  }

  var SET_ICONS = (function(){
    var o = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    return {
      profile: o + '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      goals: o + '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
      prefs: o + '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>',
      look: o + '<circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"></path></svg>',
      data: o + '<ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>',
      install: o + '<path d="M12 3v12"></path><polyline points="7 10 12 15 17 10"></polyline><path d="M5 21h14"></path></svg>',
      info: o + '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
      edit: o + '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>'
    };
  })();

