  function signInHeadHtml(){
    return '<div class="signin-head"><img class="signin-logo" src="images/logo-mark.png" alt="SaviorFuel"><h2>SaviorFuel</h2><p>Track your food. Never lose your log.</p></div>';
  }
  function signInHomeHtml(first){
    return '<div class="signin-points">' +
        '<div class="signin-pt"><i>' + SI_ICONS.cloud + '</i>Your log is backed up</div>' +
        '<div class="signin-pt"><i>' + SI_ICONS.phone + '</i>Same data on every phone</div>' +
        '<div class="signin-pt"><i>' + SI_ICONS.camera + '</i>Photos stay on this phone</div>' +
      '</div>' +
      '<div class="signin-spacer"></div>' +
      '<div class="signin-actions">' +
        '<button type="button" class="signin-btn primary" data-si="google"><span class="signin-g">' + SI_ICONS.google + '</span>Continue with Google</button>' +
        '<button type="button" class="signin-btn alt" data-si="email">' + SI_ICONS.mail + 'Use email instead</button>' +
        '<div class="signin-msg" id="signInMsg" role="status" aria-live="polite"></div>' +
        '<button type="button" class="signin-skip" data-action="close-sign-in">' + (first ? 'Skip for now' : 'Not now') + '</button>' +
        '<div class="signin-note">' + (first ? 'Skipping keeps your log on this phone only. You can sign in later from Profile.' : 'Your log stays on this phone until you sign in.') + '</div>' +
      '</div>';
  }
  function signInEmailHtml(){
    var up = siState.mode === 'up';
    return '<div class="signin-spacer"></div>' +
      '<form class="signin-form" id="siForm" novalidate>' +
        '<h3>' + (up ? 'Create your account' : 'Welcome back') + '</h3>' +
        '<input class="signin-input" type="email" id="siEmail" placeholder="Email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false">' +
        '<input class="signin-input" type="password" id="siPass" placeholder="' + (up ? 'Password (6+ characters)' : 'Password') + '" autocomplete="' + (up ? 'new-password' : 'current-password') + '">' +
        '<button type="submit" class="signin-btn primary" data-si="submit">' + (up ? 'Create account' : 'Sign in') + '</button>' +
        '<div class="signin-msg" id="signInMsg" role="status" aria-live="polite"></div>' +
        '<button type="button" class="signin-skip" data-si="toggle">' + (up ? 'Already have an account? Sign in' : 'New here? Create an account') + '</button>' +
        (up ? '' : '<button type="button" class="signin-skip dim" data-si="forgot">Forgot password?</button>') +
        '<button type="button" class="signin-skip dim" data-si="back">Back</button>' +
      '</form>';
  }
  function renderSignIn(view, first){
    var card = document.querySelector('#signInOverlay .signin-card');
    if (!card) return;
    card.innerHTML = signInHeadHtml() + (view === 'email' ? signInEmailHtml() : signInHomeHtml(first));
    card.dataset.first = first ? '1' : '';
    if (view === 'email'){ var e = document.getElementById('siEmail'); if (e) e.focus(); }
  }

  function openSignIn(first){
    if (document.getElementById('signInOverlay')) return;
    siState.mode = 'in';
    var el = document.createElement('div');
    el.id = 'signInOverlay';
    el.className = 'signin-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Sign in');
    el.innerHTML = '<div class="signin-card"></div>';
    document.getElementById('app').parentNode.appendChild(el);
    renderSignIn('home', first);
  }
  function closeSignIn(){
    var el = document.getElementById('signInOverlay');
    if (el) el.remove();
  }
  function signInMsg(t, bad){
    var m = document.getElementById('signInMsg');
    if (m){ m.textContent = t || ''; m.classList.toggle('bad', !!bad); }
  }
  function signInBusy(on){
    document.querySelectorAll('#signInOverlay .signin-btn').forEach(function(b){ b.disabled = !!on; });
  }
  function signInDone(){
    // Signed in: the sync merge runs on its own (see syncOnAuth); close the screen.
    closeSignIn();
    showToast('Signed in');
  }
  function signInSubmit(){
    var email = (document.getElementById('siEmail').value || '').trim();
    var pw = document.getElementById('siPass').value || '';
    if (!email){ signInMsg('Enter your email.', true); return; }
    if (!pw){ signInMsg('Enter your password.', true); return; }
    signInBusy(true); signInMsg('One moment…');
    syncEmail(siState.mode, email, pw).then(signInDone).catch(function(err){
      signInBusy(false); signInMsg(syncAuthMessage(err), true);
    });
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest('#signInOverlay [data-si], #signInOverlay [data-action="close-sign-in"]');
    if (!b) return;
    if (b.getAttribute('data-action') === 'close-sign-in'){ closeSignIn(); return; }
    var what = b.getAttribute('data-si');
    var first = !!(document.querySelector('#signInOverlay .signin-card') || {}).dataset && document.querySelector('#signInOverlay .signin-card').dataset.first === '1';
    if (what === 'google'){
      if (!syncEnabled()){ signInMsg('Sign-in isn’t switched on yet. Your log is saved on this phone for now.'); return; }
      signInBusy(true); signInMsg('Opening Google…');
      syncGoogle().then(signInDone).catch(function(err){ signInBusy(false); signInMsg(syncAuthMessage(err), true); });
    } else if (what === 'email'){
      if (!syncEnabled()){ signInMsg('Sign-in isn’t switched on yet. Your log is saved on this phone for now.'); return; }
      renderSignIn('email', first);
    } else if (what === 'back'){ renderSignIn('home', first);
    } else if (what === 'toggle'){ siState.mode = siState.mode === 'up' ? 'in' : 'up'; renderSignIn('email', first);
    } else if (what === 'forgot'){
      var em = (document.getElementById('siEmail').value || '').trim();
      if (!em){ signInMsg('Type your email above first, then tap Forgot password.', true); return; }
      signInBusy(true); signInMsg('One moment…');
      syncReset(em).then(function(){ signInBusy(false); signInMsg('Check your email for a reset link.'); })
        .catch(function(err){ signInBusy(false); signInMsg(syncAuthMessage(err), true); });
    }
  });
  document.addEventListener('submit', function(e){
    if (e.target && e.target.id === 'siForm'){ e.preventDefault(); signInSubmit(); }
  });

  /* Account screen (signed in): status, sync now, sign out, delete account. */
  function openAccount(){
    if (document.getElementById('accountOverlay') || !sync.user) return;
    var u = sync.user;
    var el = document.createElement('div');
    el.id = 'accountOverlay';
    el.className = 'signin-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Account');
    el.innerHTML = '<div class="signin-card">' + signInHeadHtml().replace('<p>Track your food. Never lose your log.</p>', '<p>' + esc(u.email || u.displayName || 'Signed in') + '</p>') +
      '<div class="signin-spacer"></div>' +
      '<div class="signin-actions">' +
        '<div class="acct-status" id="accountStatus">' + esc(syncStatusText()) + '</div>' +
        '<button type="button" class="signin-btn primary" data-acct="sync">Sync now</button>' +
        '<button type="button" class="signin-btn alt" data-acct="signout">Sign out</button>' +
        '<div class="signin-msg" id="accountMsg" role="status" aria-live="polite"></div>' +
        '<button type="button" class="signin-skip" data-acct="close">Close</button>' +
        '<button type="button" class="signin-skip danger" data-acct="delete">Delete my account and cloud data</button>' +
        '<div class="signin-note">Signing out keeps your log on this phone. Deleting removes your account and everything stored online; the log on this phone stays.</div>' +
      '</div></div>';
    document.getElementById('app').parentNode.appendChild(el);
  }
  function closeAccount(){ var el = document.getElementById('accountOverlay'); if (el) el.remove(); if (state.tab === 'settings') renderApp(); }
  function acctMsg(t, bad){ var m = document.getElementById('accountMsg'); if (m){ m.textContent = t || ''; m.classList.toggle('bad', !!bad); } }
  document.addEventListener('click', function(e){
    var b = e.target.closest('#accountOverlay [data-acct]');
    if (!b) return;
    var what = b.getAttribute('data-acct');
    if (what === 'close'){ closeAccount(); }
    else if (what === 'sync'){
      acctMsg('');
      syncFlush().then(function(){ return sync.user ? syncStart(sync.user) : null; }).then(function(){ var s = document.getElementById('accountStatus'); if (s) s.textContent = syncStatusText(); });
    } else if (what === 'signout'){
      syncSignOut().then(function(){ closeAccount(); showToast('Signed out. Your log is still on this phone.'); })
        .catch(function(err){ acctMsg(syncAuthMessage(err), true); });
    } else if (what === 'delete'){
      if (!window.confirm('Delete your account and all cloud data? This can’t be undone. The log on this phone stays.')) return;
      acctMsg('Deleting…');
      syncDeleteAccount().then(function(){ closeAccount(); showToast('Account deleted'); })
        .catch(function(err){ acctMsg(syncAuthMessage(err) || '', true); });
    }
  });

  function closeWelcome(){
    var el = document.getElementById('welcomeOverlay');
    if (el) el.remove();
  }

  function welcomeDone(applyPlan){
    STORE.appSettings.welcomed = true;
    if (applyPlan && welcome.plan){
      STORE.profile = welcome.plan.profile;
      STORE.goals = Object.assign({}, STORE.goals, { calories: welcome.plan.calories, protein: welcome.plan.protein, carbs: welcome.plan.carbs, fat: welcome.plan.fat });
      STORE.lastPlanTdee = Math.round(welcome.plan.tdee);
      STORE.appSettings.unit = welcome.unit;
    }
    saveStore();
    closeWelcome();
    applyAppearanceSettings();
    renderApp();
    if (applyPlan && welcome.plan) showToast('Daily target set: ' + welcome.plan.calories + ' kcal');
  }

  function welcomeCapture(){
    var g = function(id){ var e = document.getElementById(id); return e ? e.value : null; };
    if (g('wAge') !== null) welcome.age = g('wAge');
    if (g('wHeight') !== null) welcome.height = g('wHeight');
    if (g('wWeight') !== null) welcome.weight = g('wWeight');
    if (g('wActivity') !== null) welcome.activity = g('wActivity');
  }

  function inRange(v, lim){ return v >= lim[0] && v <= lim[1]; }
  function welcomeBuildPlan(){
    var imperial = welcome.unit === 'imperial';
    var h = parseFloat(welcome.height), w = parseFloat(welcome.weight), age = parseInt(welcome.age, 10);
    var profile = {
      sex: welcome.sex,
      age: (age >= PLAN_LIMITS.age[0] && age <= PLAN_LIMITS.age[1]) ? age : DEFAULT_PROFILE.age,
      heightCm: Math.round(inRange(imperial ? inToCm(h) : h, PLAN_LIMITS.heightCm) ? (imperial ? inToCm(h) : h) : DEFAULT_PROFILE.heightCm),
      weightKg: Math.round((inRange(imperial ? lbToKg(w) : w, PLAN_LIMITS.weightKg) ? (imperial ? lbToKg(w) : w) : DEFAULT_PROFILE.weightKg) * 10) / 10,
      activityLevel: welcome.activity,
      goal: welcome.goal
    };
    var plan = computePlan(profile);
    plan.profile = profile;
    welcome.plan = plan;
  }

  function renderWelcome(){
    var el = document.getElementById('welcomeOverlay');
    if (!el){
      el = document.createElement('div');
      el.id = 'welcomeOverlay';
      el.className = 'welcome-overlay';
      document.getElementById('app').parentNode.appendChild(el);
    }
    var imperial = welcome.unit === 'imperial';
    var st = welcome.step;
    var dots = '<div class="welcome-dots">' + [0,1,2,3].map(function(i){ return '<i class="' + (i === st ? 'on' : (i < st ? 'done' : '')) + '"></i>'; }).join('') + '</div>';
    var body = '', footer = '';

    if (st === 0){
      body = '<img class="welcome-logo" src="images/logo-mark.png" alt="SaviorFuel">' +
        '<h2>Welcome to SaviorFuel</h2>' +
        '<p>Log your meals, see your macros and hit your daily goals. Let’s set your target in 30 seconds.</p>';
      footer = '<button class="welcome-primary" data-w="next">Get started</button><button class="welcome-skip" data-w="skip">Skip for now</button>';
    } else if (st === 1){
      body = '<h2>About you</h2><p>Used only to estimate your daily calories. It stays on this device.</p>' +
        '<div class="welcome-field"><label>Units</label><div class="welcome-seg">' +
          '<button data-w="unit" data-v="metric" class="' + (!imperial ? 'active' : '') + '">kg / cm</button>' +
          '<button data-w="unit" data-v="imperial" class="' + (imperial ? 'active' : '') + '">lb / in</button></div></div>' +
        '<div class="welcome-field"><label>Sex</label><div class="welcome-seg">' +
          '<button data-w="sex" data-v="male" class="' + (welcome.sex === 'male' ? 'active' : '') + '">Male</button>' +
          '<button data-w="sex" data-v="female" class="' + (welcome.sex === 'female' ? 'active' : '') + '">Female</button></div></div>' +
        '<div class="welcome-row">' +
          '<div class="welcome-field"><label for="wAge">Age</label><input id="wAge" type="number" inputmode="numeric" min="10" max="100" placeholder="' + DEFAULT_PROFILE.age + '" value="' + esc(welcome.age) + '"></div>' +
          '<div class="welcome-field"><label for="wHeight">Height (' + (imperial ? 'in' : 'cm') + ')</label><input id="wHeight" type="number" inputmode="decimal" placeholder="' + Math.round(imperial ? cmToIn(DEFAULT_PROFILE.heightCm) : DEFAULT_PROFILE.heightCm) + '" value="' + esc(welcome.height) + '"></div>' +
          '<div class="welcome-field"><label for="wWeight">Weight (' + (imperial ? 'lb' : 'kg') + ')</label><input id="wWeight" type="number" inputmode="decimal" placeholder="' + Math.round(imperial ? kgToLb(DEFAULT_PROFILE.weightKg) : DEFAULT_PROFILE.weightKg) + '" value="' + esc(welcome.weight) + '"></div>' +
        '</div>';
      footer = '<button class="welcome-primary" data-w="next">Next</button><button class="welcome-skip" data-w="skip">Skip for now</button>';
    } else if (st === 2){
      body = '<h2>Your goal</h2><p>Pick what fits you. You can change it any time in Settings.</p>' +
        '<div class="welcome-goals">' + GOAL_OPTIONS.map(function(o){
          return '<button data-w="goal" data-v="' + o.id + '" class="' + (welcome.goal === o.id ? 'active' : '') + '"><b>' + o.label + '</b><span>' +
            esc(o.desc) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="welcome-field"><label>Activity level</label>' +
          pickSelectHtml('wActivity', ACTIVITY_LEVELS.map(function(a){ return '<option value="' + a.id + '"' + (welcome.activity === a.id ? ' selected' : '') + '>' + a.label + '</option>'; }).join(''), '',
            (ACTIVITY_LEVELS.filter(function(a){ return a.id === welcome.activity; })[0] || ACTIVITY_LEVELS[2]).label) + '</div>';
      footer = '<button class="welcome-primary" data-w="next">See my plan</button><button class="welcome-skip" data-w="skip">Skip for now</button>';
    } else {
      var pl = welcome.plan;
      body = '<h2>Your daily target</h2>' +
        '<div class="welcome-plan-kcal">' + pl.calories.toLocaleString() + '<span>kcal / day</span></div>' +
        '<div class="macro-tiles">' +
          macroTileHtml('Protein', pl.protein, pl.protein, 'protein').replace(/<span>\/\d+g<\/span>/, '<span>g</span>') +
          macroTileHtml('Carbs', pl.carbs, pl.carbs, 'carbs').replace(/<span>\/\d+g<\/span>/, '<span>g</span>') +
          macroTileHtml('Fat', pl.fat, pl.fat, 'fat').replace(/<span>\/\d+g<\/span>/, '<span>g</span>') +
        '</div>' +
        '<p class="welcome-note">An estimate to start from. Adjust any number later in Settings.</p>';
      footer = '<button class="welcome-primary" data-w="finish">Start logging</button><button class="welcome-skip" data-w="back">Back</button>';
    }
    el.innerHTML = '<div class="welcome-card">' + dots + '<div class="welcome-body">' + body + '</div><div class="welcome-footer">' + footer + '</div></div>';
  }

  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-w]');
    if (!b || !document.getElementById('welcomeOverlay')) return;
    var w = b.dataset.w;
    welcomeCapture();
    if (w === 'skip'){ welcomeDone(false); return; }
    if (w === 'finish'){ welcomeDone(true); return; }
    if (w === 'unit'){
      // convert anything already typed so switching units doesn't scramble it
      var to = b.dataset.v;
      if (to !== welcome.unit){
        var h = parseFloat(welcome.height), wt = parseFloat(welcome.weight);
        if (h > 0) welcome.height = String(Math.round(to === 'imperial' ? cmToIn(h) : inToCm(h)));
        if (wt > 0) welcome.weight = String(Math.round(to === 'imperial' ? kgToLb(wt) : lbToKg(wt)));
        welcome.unit = to;
      }
    } else if (w === 'sex'){ welcome.sex = b.dataset.v; }
    else if (w === 'goal'){ welcome.goal = b.dataset.v; }
    else if (w === 'back'){ welcome.step = Math.max(0, welcome.step - 1); }
    else if (w === 'next'){
      welcome.step = Math.min(3, welcome.step + 1);
      if (welcome.step === 3) welcomeBuildPlan();
    }
    renderWelcome();
  });

  /* ---------- Phone back button / swipe-back steps back instead of quitting ----------
     The app is one page, so back used to leave the app even with a panel open.
     Every open panel (add food, search, scanner, sheets, day view, dialogs) is
     a "layer" with one history entry; back closes the top layer using its own
     close/cancel button. With nothing open, back on another tab returns to
     Log, and on Log the first press shows "Press back again to exit". */
  var BACK_LAYER_IDS = ['aiZoom', 'recentOverlay', 'accountOverlay', 'signInOverlay', 'foodSearchOverlay', 'scanOverlay', 'photoOverlay', 'nutrientInfoOverlay',
    'addMealOverlay', 'aiScanOverlay', 'confirmOverlay', 'panelOverlay', 'foodSheet', 'mealMenu', 'calSheet', 'dayOverlay'];
  var BACK_NEEDS_OPEN = { addMealOverlay: 1, aiScanOverlay: 1, recentOverlay: 1, confirmOverlay: 1, panelOverlay: 1 };
  var backDepth = 0, backIgnorePops = 0, backSyncQueued = false, exitArmed = false, exitArmTimer = null;
