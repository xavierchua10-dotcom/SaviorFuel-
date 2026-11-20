  function backLayerEls(){
    var out = [];
    BACK_LAYER_IDS.forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      if (el.classList.contains('hidden')) return;
      if (BACK_NEEDS_OPEN[id] && !el.classList.contains('open')) return;
      out.push(el);
    });
    out.sort(function(a, b){
      var za = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
      var zb = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
      if (za !== zb) return za - zb;
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    return out;
  }
  function backFirstRun(){ return !!document.querySelector('.welcome-overlay'); }
  function backTabStep(){ return !backFirstRun() && state.tab !== 'log'; }
  function backExitGuard(){ return !backFirstRun() && state.tab === 'log' && !exitArmed; }
  function backLayerCount(){
    return backLayerEls().length + (backTabStep() ? 1 : 0) + (backExitGuard() ? 1 : 0);
  }
  function syncBackHistory(){
    backSyncQueued = false;
    var n = backLayerCount();
    if (n > backDepth){
      while (backDepth < n){
        try { history.pushState({ sfLayer: true }, '', location.href); } catch (err){ return; }
        backDepth++;
      }
    } else if (n < backDepth){
      var diff = backDepth - n;
      backDepth = n;
      backIgnorePops++;            // history.go(-diff) fires exactly one popstate
      history.go(-diff);
    }
  }
  function queueBackSync(){
    if (backSyncQueued) return;
    backSyncQueued = true;
    Promise.resolve().then(syncBackHistory);   // microtask: still inside the same tap
  }
  function closeTopBackLayer(){
    var els = backLayerEls();
    if (!els.length){
      if (backTabStep()) switchTab('log');
      else if (backExitGuard()){
        exitArmed = true;
        showToast('Press back again to exit');
        if (exitArmTimer) clearTimeout(exitArmTimer);
        exitArmTimer = setTimeout(function(){ exitArmed = false; }, 2500);
      }
      return;
    }
    var top = els[els.length - 1];
    var nodes = top.querySelectorAll('[data-action^="close-"],[data-action^="cancel-"]');
    for (var i = 0; i < nodes.length; i++){
      if (nodes[i].getClientRects().length){ nodes[i].click(); return; }
    }
    top.click();                   // a tap on the backdrop itself
  }
  window.addEventListener('popstate', function(){
    if (backIgnorePops > 0){ backIgnorePops--; return; }
    if (backDepth <= 0) return;    // not ours
    backDepth--;
    closeTopBackLayer();
    queueBackSync();               // if nothing closed, the entry is pushed back and the press is absorbed
  });
  document.addEventListener('click', queueBackSync, true);
  if (typeof MutationObserver !== 'undefined'){
    var backMo = new MutationObserver(queueBackSync);
    BACK_LAYER_IDS.forEach(function(id){
      var el = document.getElementById(id);
      if (el) backMo.observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    backMo.observe(document.body, { childList: true });
    var appEl = document.getElementById('app');
    if (appEl) backMo.observe(appEl, { childList: true });
  }

  // App shortcuts (long-press the icon) open e.g. "./?tab=scan".
  try {
    var launchTab = new URLSearchParams(location.search).get('tab');
    if (['log', 'history', 'scan', 'insights', 'settings'].indexOf(launchTab) !== -1) state.tab = launchTab;
  } catch (e) {}

  applyAppearanceSettings();
  document.getElementById('bootLoading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderApp();
  maybeShowWelcome();
  setTimeout(function(){ makeSafetyCopy('daily'); }, 4000);
  if (syncEnabled() && sync.meta.wasSignedIn) setTimeout(function(){ syncLoad().catch(function(){}); }, 800);

  // Registered after boot so it never delays first paint — this is
  // what lets the app open at all with no connection, and caches
  // static assets (fonts, background image, the food-photo model
  // once used) opportunistically. Deliberately doesn't cache USDA/
  // OFF/Kalori search calls — see sw.js.
  if ('serviceWorker' in navigator){
    // Left open past midnight: when the app comes back, move Log onto the new day.
    setTimeout(function(){ loadBuiltinFoods(); }, 2500); // warm the built-in food list in the background
    var lastSeenDay = todayKey();
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState !== 'visible') return;
      var nowKey = todayKey();
      if (nowKey === lastSeenDay) return;
      if (ui.logDay === lastSeenDay) ui.logDay = null;
      lastSeenDay = nowKey;
      renderApp();
    });
    window.addEventListener('load', function(){
      // A new version of the app: look for one every time the app comes back
      // to the screen, and when one takes over, offer a one-tap refresh.
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then(function(reg){
          document.addEventListener('visibilitychange', function(){
            if (document.visibilityState === 'visible') reg.update().catch(function(){});
          });
        })
        .catch(function(err){ console.error('SaviorFuel: service worker registration failed —', err); });
      navigator.serviceWorker.addEventListener('controllerchange', function(){
        if (!hadController){ hadController = true; return; } // first-ever install, nothing to refresh
        showToast('New version ready', 'Refresh', function(){ location.reload(); });
      });
    });
  }
