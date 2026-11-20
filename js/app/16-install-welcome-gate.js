  function isStandalone(){
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function isIOSDevice(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function canOfferInstall(){
    return !isStandalone() && (!!deferredInstall || isIOSDevice());
  }

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();               // we show our own button instead of the mini-bar
    deferredInstall = e;
    if (state.tab === 'log' || state.tab === 'settings') renderApp();
  });
  window.addEventListener('appinstalled', function(){
    deferredInstall = null;
    STORE.appSettings.installDismissed = true;
    saveStore();
    renderApp();
    showToast('SaviorFuel installed');
  });

  function installApp(){
    if (deferredInstall){
      var promptEvent = deferredInstall;
      promptEvent.prompt();
      promptEvent.userChoice.then(function(choice){
        deferredInstall = null;
        if (choice && choice.outcome !== 'accepted'){ STORE.appSettings.installDismissed = true; saveStore(); }
        renderApp();
      });
    } else if (isIOSDevice()){
      openInstallHelp();
    }
  }

  function openInstallHelp(){
    if (document.getElementById('installHelp')) return;
    var el = document.createElement('div');
    el.id = 'installHelp';
    el.className = 'install-help';
    el.innerHTML = '<div class="install-help-card" role="dialog" aria-label="Install SaviorFuel">' +
        '<img src="images/logo-mark.png" alt="" class="install-help-logo">' +
        '<h3>Add to Home Screen</h3>' +
        '<ol><li>Tap the <b>Share</b> button <span class="ih-share">⬆︎</span> in Safari’s toolbar</li>' +
        '<li>Scroll down and tap <b>Add to Home Screen</b></li>' +
        '<li>Tap <b>Add</b> — SaviorFuel opens like a normal app</li></ol>' +
        '<button type="button" class="welcome-primary" data-action="close-install-help">Got it</button>' +
      '</div>';
    document.body.appendChild(el);
  }

  function installBannerHtml(){
    if (!canOfferInstall() || STORE.appSettings.installDismissed || STORE.meals.length === 0) return '';
    return '<div class="install-banner">' +
      '<img src="icons/icon-192.png" alt="" class="install-banner-icon">' +
      '<div class="install-banner-text"><b>Install SaviorFuel</b><span>Opens like an app, works offline</span></div>' +
      '<button type="button" class="install-banner-btn" data-action="install-app">Install</button>' +
      '<button type="button" class="install-banner-x" data-action="dismiss-install" aria-label="Dismiss">×</button>' +
    '</div>';
  }

  /* =========================================================
     FIRST-RUN WELCOME — 4 short steps, skippable at any point.
     Sets units, profile and daily goals, then never shows again.
     ========================================================= */
  var welcome = { step: 0, unit: 'metric', sex: 'male', age: '', height: '', weight: '', goal: 'maintain', activity: 'moderate', plan: null };

  function maybeShowWelcome(){
    if (STORE.appSettings.welcomed) return;
    if (STORE.meals.length > 0){ STORE.appSettings.welcomed = true; saveStore(); return; } // existing user
    welcome.unit = STORE.appSettings.unit === 'imperial' ? 'imperial' : 'metric';
    welcome.step = 0;            // intro, then the 3 setup screens; sign-in is offered after the first meal (or via "Already have an account")
    renderWelcome();
  }

  /* =========================================================
     ACCOUNT + SYNC (Firebase Auth + Firestore)

     Optional. Off until FIREBASE_CONFIG is filled in; with it empty the
     app is exactly the local-only app it always was. When on:
       - sign in with Google or email + password
       - users/{uid}            settings doc (goals, profile, settings,
                                My Foods, water)
       - users/{uid}/meals/{id} one doc per logged meal
     Photos never leave the phone. Sync is a diff of STORE against what
     the cloud last confirmed (sync.meta.map), so every existing save
     path (add, edit, delete, import, clear) syncs without changes, and
     a meal deleted on one phone is deleted everywhere. The Firebase SDK
     is only downloaded once someone signs in (or was signed in).
     ========================================================= */
  var FIREBASE_CONFIG = { // public web config (safe to ship); the Firestore rules are what protect the data
    apiKey: "AIzaSyAqmop4g7Satbh-QGl40GJK1AImrfKDGqo",
    authDomain: "saviorfuel-64e86.firebaseapp.com",
    projectId: "saviorfuel-64e86",
    storageBucket: "saviorfuel-64e86.firebasestorage.app",
    messagingSenderId: "151959590873",
    appId: "1:151959590873:web:e1cfd56f55c524555c2bc8"
  };
  var FB_BASE = 'https://www.gstatic.com/firebasejs/10.13.0/';
  var SYNC_META_KEY = 'saviorfuel_sync_v1';
  var sync = { fb: null, auth: null, db: null, user: null, loading: null, status: 'off', unsubs: [], pushTimer: 0, applying: false, pushing: false, again: false, renderTimer: 0, meta: null };

