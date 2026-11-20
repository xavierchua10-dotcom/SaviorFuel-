  function syncEnabled(){ return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId); }

  function syncFreshMeta(){ return { owner: null, map: {}, settingsHash: '', settingsAt: 0, lastAt: 0, wasSignedIn: false }; }
  function syncLoadMeta(){
    try {
      var m = JSON.parse(localStorage.getItem(SYNC_META_KEY) || 'null');
      if (m && typeof m === 'object') return Object.assign(syncFreshMeta(), m, { map: (m.map && typeof m.map === 'object') ? m.map : {} });
    } catch (e){}
    return syncFreshMeta();
  }
  sync.meta = syncLoadMeta();
  function syncSaveMeta(){ try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(sync.meta)); } catch (e){} }

  function syncStable(v){
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(syncStable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function(k){ return JSON.stringify(k) + ':' + syncStable(v[k]); }).join(',') + '}';
  }
  function syncH(str){
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '.' + str.length.toString(36);
  }
  function syncMealOut(m){ var c = JSON.parse(JSON.stringify(m)); delete c.photoId; return c; }   // photos stay on the phone
  function syncMealHash(m){ return syncH(syncStable(syncMealOut(m))); }
  function syncSettingsOut(){
    var a = Object.assign({}, STORE.appSettings); delete a.aiScanConsent;
    return JSON.parse(JSON.stringify({ goals: STORE.goals, profile: STORE.profile, appSettings: a, myFoods: STORE.myFoods || [], water: STORE.water || {}, lastPlanTdee: STORE.lastPlanTdee || null }));
  }
  function syncSettingsHash(){ return syncH(syncStable(syncSettingsOut())); }

  function syncSetStatus(st){
    if (sync.status === st) { syncUiRefresh(); return; }
    sync.status = st;
    syncUiRefresh();
  }
  function syncStatusText(){
    if (sync.status === 'syncing') return 'Syncing…';
    if (sync.status === 'offline') return 'Offline — will sync when you’re back online';
    if (sync.status === 'error') return 'Couldn’t sync — tap to retry';
    var t = sync.meta.lastAt;
    if (!t) return 'Signed in';
    var mins = Math.round((Date.now() - t) / 60000);
    return 'Synced ' + (mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }
  function syncUiRefresh(){
    var acc = document.getElementById('accountStatus');
    if (acc) acc.textContent = syncStatusText();
    if (state && state.tab === 'settings' && !document.getElementById('accountOverlay') && !document.getElementById('signInOverlay')){
      clearTimeout(sync.renderTimer);
      sync.renderTimer = setTimeout(function(){ if (state.tab === 'settings') renderApp(); }, 150);
    }
  }

  function syncLoad(){
    if (sync.loading) return sync.loading;
    if (!syncEnabled()) return Promise.reject({ code: 'sync/not-configured' });
    sync.loading = Promise.all([
      import(FB_BASE + 'firebase-app.js'),
      import(FB_BASE + 'firebase-auth.js'),
      import(FB_BASE + 'firebase-firestore.js')
    ]).then(function(m){
      sync.fb = { A: m[0], Au: m[1], F: m[2] };
      var app = sync.fb.A.initializeApp(FIREBASE_CONFIG);
      sync.auth = sync.fb.Au.getAuth(app);
      try { sync.db = sync.fb.F.initializeFirestore(app, { localCache: sync.fb.F.persistentLocalCache() }); }
      catch (e){ sync.db = sync.fb.F.getFirestore(app); }
      sync.fb.Au.onAuthStateChanged(sync.auth, syncOnAuth);
      return sync;
    }).catch(function(e){ sync.loading = null; throw e; });
    return sync.loading;
  }

  function syncOnAuth(user){
    sync.user = user || null;
    if (user){
      sync.meta.wasSignedIn = true; syncSaveMeta();
      syncStart(user);
    } else {
      syncStop();
      sync.meta.wasSignedIn = false; syncSaveMeta();
      syncSetStatus('off');
    }
  }

  function syncStop(){
    sync.unsubs.forEach(function(u){ try { u(); } catch (e){} });
    sync.unsubs = [];
    clearTimeout(sync.pushTimer);
  }

  function syncApplyRemoteSettings(rs, keepLocalWater){
    STORE.goals = Object.assign({}, DEFAULT_GOALS, rs.goals || {});
    STORE.profile = Object.assign({}, DEFAULT_PROFILE, rs.profile || {});
    var consent = STORE.appSettings && STORE.appSettings.aiScanConsent;
    STORE.appSettings = Object.assign({}, DEFAULT_APP_SETTINGS, rs.appSettings || {});
    STORE.appSettings.aiScanConsent = !!consent;
    STORE.myFoods = Array.isArray(rs.myFoods) ? rs.myFoods : [];
    var water = Object.assign({}, rs.water || {});
    if (keepLocalWater && STORE.water) Object.keys(STORE.water).forEach(function(k){ water[k] = Math.max(water[k] || 0, STORE.water[k] || 0); });
    STORE.water = water;
    if (rs.lastPlanTdee) STORE.lastPlanTdee = rs.lastPlanTdee;
  }

  // The first sync after sign-in: three-way merge of this phone's log and
  // the cloud's, using what was last confirmed (sync.meta.map) as the base.
  function syncMerge(uid, remoteDoc, remote){
    var foreign = !!(sync.meta.owner && sync.meta.owner !== uid); // this phone's data belongs to another account
    var base = foreign ? {} : sync.meta.map;
    var local = {}; if (!foreign) STORE.meals.forEach(function(m){ local[m.id] = m; });
    var ids = {}; Object.keys(local).forEach(function(i){ ids[i] = 1; }); Object.keys(remote).forEach(function(i){ ids[i] = 1; });
    var out = [], newMap = {};
    Object.keys(ids).forEach(function(id){
      var L = local[id], R = remote[id], b = base[id];
      var hl = L ? syncMealHash(L) : null, hr = R ? syncMealHash(R) : null;
      if (L && R){
        if (hl === hr){ out.push(L); newMap[id] = hr; }
        else if (hl === b){ var r2 = Object.assign({}, R); if (L.photoId) r2.photoId = L.photoId; out.push(r2); newMap[id] = hr; } // only the cloud changed
        else { out.push(L); newMap[id] = hr; }                                                                  // this phone changed: it pushes
      } else if (L){
        if (b !== undefined && hl === b){ /* deleted elsewhere, unchanged here: drop */ }
        else { out.push(L); }                                                                                  // new here (or edited after a delete): pushes
      } else if (R){
        if (b !== undefined && hr === b){ newMap[id] = hr; }                                                   // deleted here: the diff deletes it in the cloud
        else { out.push(R); newMap[id] = hr; }
      }
    });
    out.sort(function(x, y){ return x.loggedAt - y.loggedAt; });
    STORE.meals = out;

    var localHash = syncSettingsHash();
    if (!remoteDoc){
      if (foreign){ STORE.goals = Object.assign({}, DEFAULT_GOALS); STORE.profile = Object.assign({}, DEFAULT_PROFILE); STORE.myFoods = []; STORE.water = {}; }
      sync.meta.settingsHash = ''; sync.meta.settingsAt = 0;                                                    // nothing in the cloud yet: push ours
    } else if (foreign || !sync.meta.owner){
      syncApplyRemoteSettings(remoteDoc, !foreign);                                                             // the account is the source of truth
      sync.meta.settingsHash = syncSettingsHash(); sync.meta.settingsAt = remoteDoc.updatedAt || 0;
    } else if (localHash !== sync.meta.settingsHash){
      /* edited on this phone since last sync: it pushes */
    } else if ((remoteDoc.updatedAt || 0) > (sync.meta.settingsAt || 0)){
      syncApplyRemoteSettings(remoteDoc, false);
      sync.meta.settingsHash = syncSettingsHash(); sync.meta.settingsAt = remoteDoc.updatedAt || 0;
    }
    sync.meta.owner = uid;
    sync.meta.map = newMap;
    syncSaveMeta();
    syncSaveApplied();
  }

  function syncSaveApplied(){
    sync.applying = true;
    try { saveStore(); } finally { sync.applying = false; }
    applyAppearanceSettings();
    if (STORE.appSettings.welcomed) closeWelcome();
    renderApp();
  }

  function syncStart(user){
    syncStop();
    sync.status = 'syncing'; syncUiRefresh();
    var F = sync.fb.F, db = sync.db, uid = user.uid;
    var userRef = F.doc(db, 'users', uid), mealsCol = F.collection(db, 'users', uid, 'meals');
    return Promise.all([F.getDoc(userRef), F.getDocs(mealsCol)]).then(function(res){
      if (!sync.user || sync.user.uid !== uid) return;
      var remote = {};
      res[1].forEach(function(d){ var m = sanitizeMeal(Object.assign({}, d.data(), { id: d.id })); if (m) remote[m.id] = m; });
      syncMerge(uid, res[0].exists() ? res[0].data() : null, remote);
      return syncFlush(true).then(function(){ syncListen(uid, userRef, mealsCol); });
    }).catch(function(e){
      console.error('SaviorFuel sync start failed', e);
      sync.status = (navigator.onLine === false || (e && e.code === 'unavailable')) ? 'offline' : 'error';
      syncUiRefresh();
    });
  }

  function syncListen(uid, userRef, mealsCol){
    var F = sync.fb.F;
    sync.unsubs.push(F.onSnapshot(mealsCol, function(snap){
      var changed = false;
      snap.docChanges().forEach(function(ch){
        if (ch.doc.metadata.hasPendingWrites) return; // our own write coming back
        var id = ch.doc.id, i = -1;
        for (var k = 0; k < STORE.meals.length; k++) if (STORE.meals[k].id === id){ i = k; break; }
        if (ch.type === 'removed'){
          if (i > -1){ STORE.meals.splice(i, 1); changed = true; }
          delete sync.meta.map[id];
        } else {
          var m = sanitizeMeal(Object.assign({}, ch.doc.data(), { id: id }));
          if (!m) return;
          var h = syncMealHash(m);
          if (i > -1){
            if (syncMealHash(STORE.meals[i]) !== h){
              if (sync.meta.map[id] === undefined || syncMealHash(STORE.meals[i]) === sync.meta.map[id]){
                if (STORE.meals[i].photoId) m.photoId = STORE.meals[i].photoId;
                STORE.meals[i] = m; changed = true; sync.meta.map[id] = h;
              }
            } else sync.meta.map[id] = h;
          } else {
            STORE.meals.push(m); changed = true; sync.meta.map[id] = h;
          }
        }
      });
      if (changed){ syncSaveMeta(); syncRemoteApplied(); }
    }, function(e){ console.error('SaviorFuel meals listener', e); }));
    sync.unsubs.push(F.onSnapshot(userRef, function(d){
      if (d.metadata.hasPendingWrites || !d.exists()) return;
      var rs = d.data();
      if ((rs.updatedAt || 0) <= (sync.meta.settingsAt || 0)) return;
      if (syncSettingsHash() !== sync.meta.settingsHash) return; // unsent local edits win
      syncApplyRemoteSettings(rs, true);
      sync.meta.settingsHash = syncSettingsHash(); sync.meta.settingsAt = rs.updatedAt || 0;
      syncSaveMeta(); syncRemoteApplied();
    }, function(e){ console.error('SaviorFuel settings listener', e); }));
  }

  function syncRemoteApplied(){
    sync.applying = true;
    try { saveStore(); } finally { sync.applying = false; }
    applyAppearanceSettings();
    clearTimeout(sync.renderTimer);
    sync.renderTimer = setTimeout(function(){ renderApp(); }, 250);
  }

  function syncSchedule(){
    if (!sync.user || sync.applying) return;
    clearTimeout(sync.pushTimer);
    sync.pushTimer = setTimeout(function(){ syncFlush(false); }, 1500);
  }

  // Push whatever differs from what the cloud last confirmed.
  function syncFlush(){
    if (!sync.user || !sync.db || !sync.fb || sync.applying) return Promise.resolve();
    if (sync.pushing){ sync.again = true; return Promise.resolve(); }
    var F = sync.fb.F, db = sync.db, uid = sync.user.uid;
    var map = sync.meta.map, cur = {};
    STORE.meals.forEach(function(m){ cur[m.id] = syncMealHash(m); });
    var upserts = STORE.meals.filter(function(m){ return map[m.id] !== cur[m.id]; });
    var removed = Object.keys(map).filter(function(id){ return !(id in cur); });
    var sOut = syncSettingsOut(), sHash = syncH(syncStable(sOut));
    var sChanged = sHash !== sync.meta.settingsHash;
    if (!upserts.length && !removed.length && !sChanged){
      sync.status = 'synced'; syncUiRefresh();
      return Promise.resolve();
    }
    var now = Date.now(), ops = [];
    if (sChanged) ops.push(function(b){ b.set(F.doc(db, 'users', uid), Object.assign({}, sOut, { updatedAt: now })); });
    upserts.forEach(function(m){ ops.push(function(b){ b.set(F.doc(db, 'users', uid, 'meals', m.id), syncMealOut(m)); }); });
    removed.forEach(function(id){ ops.push(function(b){ b.delete(F.doc(db, 'users', uid, 'meals', id)); }); });
    sync.pushing = true;
    sync.status = (navigator.onLine === false) ? 'offline' : 'syncing'; syncUiRefresh();
    var p = Promise.resolve();
    for (var i = 0; i < ops.length; i += 400){
      (function(chunk){
        p = p.then(function(){ var b = F.writeBatch(db); chunk.forEach(function(op){ op(b); }); return b.commit(); });
      })(ops.slice(i, i + 400));
    }
    return p.then(function(){
      upserts.forEach(function(m){ sync.meta.map[m.id] = cur[m.id]; });
      removed.forEach(function(id){ delete sync.meta.map[id]; });
      if (sChanged){ sync.meta.settingsHash = sHash; sync.meta.settingsAt = now; }
      sync.meta.lastAt = Date.now();
      syncSaveMeta();
      sync.status = 'synced';
    }).catch(function(e){
      console.error('SaviorFuel sync push failed', e);
      sync.status = (navigator.onLine === false || (e && e.code === 'unavailable')) ? 'offline' : 'error';
    }).then(function(){
      sync.pushing = false;
      syncUiRefresh();
      if (sync.again){ sync.again = false; syncSchedule(); }
    });
  }

  window.addEventListener('online', function(){ if (sync.user) syncFlush(); });
  window.addEventListener('offline', function(){ if (sync.user) syncSetStatus('offline'); });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && sync.user) syncFlush(); });

  function syncAuthMessage(err){
    var code = err && err.code;
    switch (code){
      case 'sync/not-configured': return 'Sign-in isn’t switched on yet.';
      case 'auth/email-already-in-use': return 'That email already has an account. Try signing in.';
      case 'auth/invalid-email': return 'Enter a valid email address.';
      case 'auth/missing-password': return 'Enter your password.';
      case 'auth/weak-password': return 'Password must be at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential': return 'Incorrect email or password.';
      case 'auth/too-many-requests': return 'Too many tries. Wait a bit and try again.';
      case 'auth/network-request-failed': return 'No connection. Check your internet and try again.';
      case 'auth/operation-not-allowed': return 'This sign-in method isn’t switched on in Firebase yet.';
      case 'auth/popup-blocked': return 'Your browser blocked the Google window. Allow popups and try again.';
      case 'auth/unauthorized-domain': return 'This website isn’t approved in Firebase yet.';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request': return '';
      default: return 'Something went wrong (' + (code || 'unknown') + '). Try again.';
    }
  }

  function syncGoogle(){
    return syncLoad().then(function(){
      return sync.fb.Au.signInWithPopup(sync.auth, new sync.fb.Au.GoogleAuthProvider());
    });
  }
  function syncEmail(mode, email, pw){
    return syncLoad().then(function(){
      return mode === 'up' ? sync.fb.Au.createUserWithEmailAndPassword(sync.auth, email, pw)
                           : sync.fb.Au.signInWithEmailAndPassword(sync.auth, email, pw);
    });
  }
  function syncReset(email){
    return syncLoad().then(function(){ return sync.fb.Au.sendPasswordResetEmail(sync.auth, email); });
  }
  function syncSignOut(){
    return (sync.fb ? sync.fb.Au.signOut(sync.auth) : Promise.resolve()).then(function(){
      sync.user = null; syncStop(); sync.status = 'off';
    });
  }

  // Deletes the cloud copy (every meal, the settings doc) and the account
  // itself. The log on this phone stays.
  function syncDeleteAccount(){
    var user = sync.user, F = sync.fb.F, Au = sync.fb.Au, db = sync.db, uid = user.uid;
    var google = (user.providerData || []).some(function(p){ return p.providerId === 'google.com'; });
    var reauth;
    if (google) reauth = Au.reauthenticateWithPopup(user, new Au.GoogleAuthProvider());
    else {
      var pw = window.prompt('Enter your password to delete your account:');
      if (pw === null) return Promise.reject({ code: 'auth/cancelled-popup-request' });
      reauth = Au.reauthenticateWithCredential(user, Au.EmailAuthProvider.credential(user.email, pw));
    }
    return reauth.then(function(){
      syncStop();
      return F.getDocs(F.collection(db, 'users', uid, 'meals'));
    }).then(function(snap){
      var docs = []; snap.forEach(function(d){ docs.push(d.ref); });
      var p = Promise.resolve();
      for (var i = 0; i < docs.length; i += 400){
        (function(chunk){ p = p.then(function(){ var b = F.writeBatch(db); chunk.forEach(function(r){ b.delete(r); }); return b.commit(); }); })(docs.slice(i, i + 400));
      }
      return p;
    }).then(function(){
      return F.deleteDoc(F.doc(db, 'users', uid));
    }).then(function(){
      return Au.deleteUser(user);
    }).then(function(){
      sync.user = null; sync.meta = syncFreshMeta(); syncSaveMeta(); sync.status = 'off';
    });
  }

  /* Sign-in screen: Google or email + password. With FIREBASE_CONFIG empty
     the buttons just say it isn't switched on yet and the app stays local. */
  var SI_ICONS = {
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    google: '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>'
  };

  var siState = { mode: 'in' };

