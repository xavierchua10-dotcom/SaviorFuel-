  // ---- Insights extras (Weekly view): four stat cards.
  function insightsExtraParts(){
    var g = STORE.goals;
    var map = dayStatsMap();
    var streak = streakInfo(map);
    // last 7 days: average per logged day, days on goal, best day
    var logged = 0, sum = 0, onGoal = 0, best = null;
    for (var i = 0; i < 7; i++){
      var k = dateKeyDaysAgo(i), d = map[k];
      if (!d) continue;
      logged++; sum += d.calories;
      if (dayStatus(d.calories, g.calories) === 'on') onGoal++;
      var diff = Math.abs(d.calories - g.calories);
      if (g.calories && (!best || diff < best.diff)) best = { key: k, diff: diff };
    }
    var avg = logged ? Math.round(sum / logged) : 0;
    var bestLabel = best ? new Date(best.key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }) : '—';
    // With under 3 days logged "0 / 1 days on goal" just reads like failing, so wait until there's something to judge.
    var daysEver = Object.keys(map).length, early = daysEver < 3;
    var statsHtml = '<div class="pf-stats three">' +
        statCardHtml(avg.toLocaleString(), '', 'kcal daily avg', 'accent') +
        statCardHtml(early ? '\u2013' : onGoal + ' / ' + logged, '', 'days on goal', '') +
        statCardHtml(String(streak.current), '', 'day streak', '') +
      '</div>' + (early ? '<div class="pf-stats-note">Days on goal appears after 3 days of logging.</div>' : '');
    return { stats: statsHtml };
  }

  // Weight over time: current weight, change since the first point shown, a small line chart (last 8 weeks) and a quick log button.
  function weightCardHtml(){
    var imperial = STORE.appSettings.unit === 'imperial';
    var all = weightSeries(), cutoff = dateKeyDaysAgo(56);
    var pts = all.filter(function(p){ return p.key >= cutoff; });
    if (pts.length < 2) pts = all.slice(-8);
    var conv = function(kg){ return imperial ? kgToLb(kg) : kg; };
    var unit = imperial ? 'lb' : 'kg';
    var cur = pts[pts.length - 1], first = pts[0];
    var curTxt = (Math.round(conv(cur.kg) * 10) / 10).toFixed(1);
    var note = 'Log your weight now and then to see your trend.';
    var chart = '';
    if (pts.length >= 2){
      var days = Math.max(1, Math.round((new Date(cur.key + 'T12:00:00') - new Date(first.key + 'T12:00:00')) / 86400000));
      var span = days >= 14 ? Math.round(days / 7) + ' weeks' : days + (days === 1 ? ' day' : ' days');
      var d = Math.round((conv(cur.kg) - conv(first.kg)) * 10) / 10;
      note = d === 0 ? 'No change in ' + span : '<span class="wt-arrow">' + (d < 0 ? '\u2193' : '\u2191') + '</span> ' + Math.abs(d).toFixed(1) + ' ' + unit + ' in ' + span;
      var W = 320, H = 120, lo = Infinity, hi = -Infinity;
      pts.forEach(function(p){ var v = conv(p.kg); if (v < lo) lo = v; if (v > hi) hi = v; });
      if (hi - lo < 1){ var mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
      var t0 = new Date(first.key + 'T12:00:00').getTime(), t1 = new Date(cur.key + 'T12:00:00').getTime();
      var xy = pts.map(function(p){
        var x = 10 + (t1 === t0 ? 0 : (new Date(p.key + 'T12:00:00').getTime() - t0) / (t1 - t0)) * (W - 20);
        return [x, 12 + (hi - conv(p.kg)) / (hi - lo) * (H - 30)];
      });
      var line = xy.map(function(p, i){ return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      var area = line + ' L' + xy[xy.length - 1][0].toFixed(1) + ' ' + (H - 8) + ' L' + xy[0][0].toFixed(1) + ' ' + (H - 8) + ' Z';
      var ago = days >= 14 ? Math.round(days / 7) + ' WK AGO' : days + (days === 1 ? ' DAY AGO' : ' DAYS AGO');
      chart = '<svg class="wt-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Weight over the last ' + span + '">' +
        '<defs><linearGradient id="wtGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="' + area + '" fill="url(#wtGrad)"/><path d="' + line + '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="' + xy[xy.length - 1][0].toFixed(1) + '" cy="' + xy[xy.length - 1][1].toFixed(1) + '" r="5" fill="currentColor"/>' +
        '<text x="10" y="' + (H - 1) + '" class="wt-ax">' + ago + '</text><text x="' + (W - 10) + '" y="' + (H - 1) + '" text-anchor="end" class="wt-ax">TODAY</text></svg>';
    }
    return '<div class="card wt-card"><div class="wt-top"><div><div class="wt-l">Weight</div>' +
      '<div class="wt-v">' + curTxt + ' <small>' + unit + '</small></div><div class="wt-note">' + note + '</div></div>' +
      '<button type="button" class="wt-log" data-action="edit-weight">+ Log weight</button></div>' + chart + '</div>';
  }

  // One stat card: big Oswald number, small unit, mono label (same
  // building block as SaviorFit Logger's profile stats).
  function statCardHtml(value, unit, label, tone){
    return '<div class="pf-stat' + (tone ? ' ' + tone : '') + '"><div class="pf-stat-v">' + esc(value) +
      (unit ? '<small> ' + esc(unit) + '</small>' : '') + '</div><div class="pf-stat-l">' + esc(label) + '</div></div>';
  }


  /* =========================================================
     3D VIEWERS — Insights > Daily Overview (food pyramid) and
     Insights > Weekly Overview (plain bars)
     Three.js (r128) is loaded from CDN the first time a 3D panel
     is actually opened — same lazy pattern as the food-photo model —
     so it costs nothing on app start. createModelViewer() builds one
     viewer per model; each keeps ONE renderer/scene for the whole
     session: the panel's DOM is rebuilt on every render, so mount()
     just moves the existing canvas into the fresh container, and
     unmount() stops the render loop whenever the panel isn't on
     screen. The .glb files in /models are decimated copies of the
     source models (~60k triangles, 2048px colour map) so they load in
     seconds on a phone; the service worker caches them after the
     first load.
     ========================================================= */
  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var GLTF_LOADER_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
  var ORBIT_CONTROLS_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';

  function prefersReducedMotion(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // cfg: url, bytes (size estimate for the progress bar), aria, az/el/lift
  // (starting camera angle and vertical nudge), widthFactor/heightFactor
  // (how much of the panel the model fills), autoRotateSpeed, tagMode
  // ('facing' = a tag fades with its side of the model turning away;
  // 'billboard' = always shown, a little fainter when far), and optional
  // hooks: onModel(ctx), onMount(ctx, state), onFrame(ctx, now) -> true
  // while animating, onTap(ctx, pickedObjectOrNull), onUnmount(ctx).
  function createModelViewer(cfg){
    var readyPromise = null;  // libs + scene + model; cleared on failure so reopening the tab retries
    var stage = null;         // container currently on screen, null when the panel isn't showing
    var scene, camera, renderer, controls, model = null;
    var ctx = {};             // shared with the hooks above
    var fit = { center: null, hx: 0.5, hy: 0.4, hz: 0.47, rxz: 0.69, az: cfg.az, el: cfg.el, lift: cfg.lift };
    var placed = false, userMoved = false, dirty = true;
    var rafId = 0, resumeTimer = 0, resizeObserver = null;
    var tagDefs = [], tagList = [], tagV = null, tagToCam = null; // labels pinned to points on the model (see updateTags)
    var mountState = null, pointerDown = null;

    function setStatus(text, progress){
      var box = document.getElementById('modelStatus');
      if (!box) return;
      box.classList.remove('hidden');
      var label = document.getElementById('modelStatusText');
      if (label) label.textContent = text;
      var barWrap = document.getElementById('modelBarWrap');
      if (barWrap) barWrap.classList.toggle('hidden', progress === null);
      var bar = document.getElementById('modelBar');
      if (bar && progress !== null) bar.style.width = Math.round(progress * 100) + '%';
    }
    function hideStatus(){
      var box = document.getElementById('modelStatus');
      if (box) box.classList.add('hidden');
    }

    function ensureLibs(){
      return Promise.resolve()
        .then(function(){ if (typeof THREE === 'undefined') return loadScriptOnce(THREE_URL); })
        .then(function(){
          var jobs = [];
          if (!THREE.GLTFLoader) jobs.push(loadScriptOnce(GLTF_LOADER_URL));
          if (!THREE.OrbitControls) jobs.push(loadScriptOnce(ORBIT_CONTROLS_URL));
          return Promise.all(jobs);
        });
    }

    function buildScene(){
      if (renderer) return;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      } catch (e){
        renderer = null;
        e.noWebGL = true; // lets mount() show a "device can't do 3D" message instead of "check your connection"
        throw e;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // 3x+ phones: lots of overdraw, little visible gain
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', cfg.aria);
      // Phones drop the GL context when the browser is backgrounded;
      // three.js rebuilds its state on restore, we just need to redraw.
      renderer.domElement.addEventListener('webglcontextlost', function(e){ e.preventDefault(); });
      renderer.domElement.addEventListener('webglcontextrestored', function(){ dirty = true; });

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(36, 1, 0.05, 50);

      // Lighting: no environment map here, so a hemisphere fill plus
      // key / fill / warm rim lights (the rim uses the app's accent).
      scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 0.95));
      var key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(2, 3, 2.5);
      var fill = new THREE.DirectionalLight(0xbfd0ff, 0.4);
      fill.position.set(-3, 1.5, 1);
      var rim = new THREE.DirectionalLight(0xa6e36b, 0.3);
      rim.position.set(0, 2, -3);
      scene.add(key, fill, rim);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.8;
      // Horizontal spin only: min = max pins the camera at one
      // elevation, so vertical drags do nothing.
      controls.minPolarAngle = controls.maxPolarAngle = Math.PI / 2 - fit.el;
      controls.autoRotateSpeed = cfg.autoRotateSpeed || 1.2;
      if (cfg.inline){
        // In a card on a scrolling page: a vertical swipe must still scroll the page,
        // and a pinch while scrolling shouldn't zoom the model.
        controls.enableZoom = false;
        renderer.domElement.style.touchAction = 'pan-y';
      }
      controls.addEventListener('start', function(){
        userMoved = true;
        controls.autoRotate = false;
        clearTimeout(resumeTimer);
      });
      controls.addEventListener('end', function(){
        if (prefersReducedMotion()) return;
        resumeTimer = setTimeout(function(){ controls.autoRotate = true; }, 3500);
      });
      controls.addEventListener('change', function(){ dirty = true; });

      // A short press with barely any movement is a tap (a drag is the
      // camera's): find which model part is under the finger.
      if (cfg.onTap){
        var el = renderer.domElement;
        el.addEventListener('pointerdown', function(e){ pointerDown = { x: e.clientX, y: e.clientY, t: Date.now() }; });
        el.addEventListener('pointerup', function(e){
          var d = pointerDown; pointerDown = null;
          if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || Date.now() - d.t > 450) return;
          var rect = el.getBoundingClientRect();
          var ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
          var rc = new THREE.Raycaster();
          rc.setFromCamera(ndc, camera);
          scene.updateMatrixWorld();
          var hits = rc.intersectObjects(ctx.pickables || [], false);
          cfg.onTap(ctx, hits.length ? hits[0].object : null);
          dirty = true;
        });
      }
    }

    function loadModel(){
      if (model) return Promise.resolve();
      return new Promise(function(resolve, reject){
        new THREE.GLTFLoader().load(cfg.url, function(gltf){
          model = gltf.scene;
          var maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
          model.traverse(function(node){
            if (!node.isMesh) return;
            (Array.isArray(node.material) ? node.material : [node.material]).forEach(function(m){
              // Nothing here is really metal, and with no environment
              // map any metalness would render near-black — so ignore
              // the metal channel and keep the roughness one.
              m.metalness = 0;
              m.metalnessMap = null;
              if (m.map) m.map.anisotropy = maxAniso;
              m.needsUpdate = true;
            });
          });
          scene.add(model);
          var box = new THREE.Box3().setFromObject(model);
          var size = box.getSize(new THREE.Vector3());
          fit.center = box.getCenter(new THREE.Vector3());
          fit.hx = size.x / 2;
          fit.hy = size.y / 2;
          fit.hz = size.z / 2;
          fit.rxz = Math.sqrt(size.x * size.x + size.z * size.z) / 2; // spins around Y, so use the footprint's radius
          ctx.model = model; ctx.scene = scene; ctx.camera = camera; ctx.controls = controls; ctx.renderer = renderer; ctx.fit = fit;
          if (cfg.onModel) cfg.onModel(ctx);
          resolve();
        }, function(evt){
          var total = (evt.lengthComputable && evt.total) ? evt.total : cfg.bytes;
          setStatus('Loading 3D model…', Math.min(evt.loaded / total, 0.95));
        }, function(err){
          reject(err || new Error('Could not load ' + cfg.url));
        });
      });
    }

    // Default camera distance: how much of the panel the model fills is
    // set by cfg.widthFactor (>1 = the model runs past the screen edges,
    // like the pyramid; <1 = fully in view with margin). On a very
    // wide/short screen the height limit wins so it never overflows.
    function fitDistance(){
      var tanV = Math.tan(camera.fov * Math.PI / 360);
      var tanH = tanV * camera.aspect;
      var byWidth = fit.hx / (cfg.widthFactor * tanH) + fit.hz;
      var byHeight = fit.hy / (cfg.heightFactor * tanV) + fit.hz * 0.6;
      return Math.max(byWidth, byHeight);
    }

    // Stretch the card down to the top of the bottom nav (whose height
    // varies with the device's safe area).
    function layout(){
      if (!stage || cfg.inline) return;
      var card = stage.parentNode;
      var nav = document.querySelector('.bottom-nav');
      if (card && nav) card.style.bottom = nav.offsetHeight + 'px';
    }

    function resize(){
      if (!stage || !renderer || !fit.center) return;
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); // CSS sizes the canvas (100% x 100%)
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      var d = fitDistance();
      controls.target.set(fit.center.x, fit.center.y + fit.lift, fit.center.z);
      if (!placed){
        var t = controls.target;
        camera.position.set(
          t.x + d * Math.sin(fit.az) * Math.cos(fit.el),
          t.y + d * Math.sin(fit.el),
          t.z + d * Math.cos(fit.az) * Math.cos(fit.el)
        );
        placed = true;
      } else if (!userMoved){
        var dir = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(dir, d);
      }
      controls.minDistance = d * 0.6;
      controls.maxDistance = d * 1.6;
      controls.update();
      dirty = true;
    }

    // Pins HTML labels to points on the model: each frame the 3D point
    // is projected to screen coordinates, so the label rides along as
    // the model turns. 'facing' tags fade in as their side turns toward
    // the camera (fully visible within ~30 degrees, gone past ~60) and
    // shrink a little as it turns away; 'billboard' tags stay visible
    // and just get a little fainter and smaller on the far side.
    function updateTags(){
      if (!tagList.length || !stage) return;
      var cw = stage.clientWidth, ch = stage.clientHeight;
      var camDist = camera.position.distanceTo(controls.target);
      for (var i = 0; i < tagList.length; i++){
        var t = tagList[i];
        if (t.follow) t.follow(ctx, t.pos); // pinned to something that moves (e.g. a rising wedge)
        tagV.copy(t.pos).project(camera);
        var o, sc;
        if (cfg.tagMode === 'billboard'){
          var far = Math.max(0, Math.min(1, (camera.position.distanceTo(t.pos) - (camDist - fit.rxz)) / (2 * fit.rxz)));
          o = 1 - 0.5 * far;
          sc = 1 - 0.16 * far;
        } else {
          tagToCam.subVectors(camera.position, t.pos).normalize();
          o = Math.max(0, Math.min(1, (tagToCam.dot(t.n) - 0.55) / 0.3));
          sc = 0.82 + 0.18 * o;
          // Draw the ring as its tag starts to fade in; reset it only once the
          // tag has all but vanished, so nobody sees an emptied ring.
          if (!t.on && o > 0.35){ t.on = true; t.el.classList.add('in'); }
          else if (t.on && o < 0.05){ t.on = false; t.el.classList.remove('in'); }
        }
        var sx = (tagV.x * 0.5 + 0.5) * cw;
        var sy = (-tagV.y * 0.5 + 0.5) * ch;
        t.el.style.opacity = o.toFixed(3);
        t.el.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0) translate(-50%,-50%) scale(' + sc.toFixed(3) + ')';
      }
    }

    function tick(){
      rafId = requestAnimationFrame(tick);
      var animating = cfg.onFrame ? cfg.onFrame(ctx, performance.now()) : false;
      var moved = controls.update();
      if (moved || dirty || controls.autoRotate || animating){
        renderer.render(scene, camera);
        updateTags();
        dirty = false;
      }
    }
    function startLoop(){ if (!rafId) rafId = requestAnimationFrame(tick); }
    function stopLoop(){
      if (rafId){ cancelAnimationFrame(rafId); rafId = 0; }
    }

    // tags: [{ el, pos: [x, y, z], normal: [nx, nz] }] — labels to pin
    // to points on the model (positions are in the model's own
    // coordinates; normal = the direction that side faces), or
    // [{ el, follow: function(ctx, outVector3) }] for labels that follow
    // a moving part. state: whatever the model's hooks need (the wheel
    // gets the week's numbers).
    function mount(container, tags, state){
      stage = container;
      tagDefs = tags || [];
      mountState = state || null;
      layout();
      if (!readyPromise){
        readyPromise = ensureLibs()
          .then(function(){ buildScene(); return loadModel(); })
          .catch(function(err){ readyPromise = null; throw err; });
      }
      readyPromise.then(function(){
        if (stage !== container) return; // panel was closed or re-rendered while loading
        container.appendChild(renderer.domElement);
        tagV = tagV || new THREE.Vector3();
        tagToCam = tagToCam || new THREE.Vector3();
        tagList = tagDefs.map(function(d){
          return {
            el: d.el,
            pos: d.pos ? new THREE.Vector3(d.pos[0], d.pos[1], d.pos[2]) : new THREE.Vector3(),
            n: d.normal ? new THREE.Vector3(d.normal[0], 0, d.normal[1]) : null,
            follow: d.follow || null,
            on: false
          };
        });
        if (cfg.onMount) cfg.onMount(ctx, mountState);
        controls.autoRotate = !prefersReducedMotion();
        layout();
        resize();
        hideStatus();
        if (resizeObserver) resizeObserver.disconnect();
        if (typeof ResizeObserver !== 'undefined'){
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(container);
        }
        startLoop();
      }, function(err){
        console.error('SaviorFuel: 3D model failed —', err);
        if (stage !== container) return;
        setStatus(err && err.noWebGL
          ? 'This device or browser can\'t show the 3D view.'
          : 'Couldn\'t load the 3D model. Check your connection, then reopen this tab.', null);
      });
    }

    function unmount(){
      if (!stage) return;
      stage = null;
      tagDefs = [];
      tagList = [];
      mountState = null;
      if (cfg.onUnmount) cfg.onUnmount(ctx);
      stopLoop();
      clearTimeout(resumeTimer);
      if (resizeObserver){ resizeObserver.disconnect(); resizeObserver = null; }
    }

    window.addEventListener('resize', function(){ layout(); });

    return {
      mount: mount,
      unmount: unmount,
      ctx: ctx,                                 // for the panel's own controls (e.g. closing the day card)
      redraw: function(){ dirty = true; }
    };
  }

  // Daily Overview: the food pyramid (four sides = four nutrients).
  var Model3D = createModelViewer({
    url: 'models/food-pyramid-v2.glb',
    bytes: 1660548, // for the progress bar when the server sends no length
    aria: 'Interactive 3D food pyramid. Drag to rotate, pinch to zoom.',
    az: 0.32, el: 0.2, lift: -0.07,
    widthFactor: 0.82, heightFactor: 1.12,
    inline: true, // sits in a card inside a scrolling page (not full-bleed)
    autoRotateSpeed: 1.2,
    tagMode: 'facing'
  });

  /* =========================================================
     RENDER — INSIGHTS TAB
     ========================================================= */
  // Dispatches to whichever Insights sub-tab panel is active — same
  // pattern as SaviorFit Logger's renderProgress() dispatching between
  // its Volume overview / Exercise progression views. The empty state
  // is shared: with nothing logged yet, neither panel has anything
  // meaningful to show.
  function renderInsights(){
    if (STORE.meals.length === 0){
      document.getElementById('view').innerHTML =
        '<div class="empty tab-empty-state"><div class="glyph">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M3 17l6-6 4 4 8-8"></path><path d="M15 7h6v6"></path>' +
          '</svg></div><p>Nothing to chart yet.<br>Log a few meals and your trends will appear here.</p></div>';
      return;
    }

    // One scrolling page: today's pyramid card, then the last 7 days.
    var todayMeals = mealsForDay(todayKey());
    var totals = totalsFor(todayMeals);
    var goals = STORE.goals;
    var left = goals.calories - totals.calories;
    var tagsHtml = PYRAMID_FACES.map(function(f, k){ return faceTagHtml(k, totals, goals); }).join('');
    function chip(label, key, cls){
      return '<div class="balance-chip">' + macroIconHtml(cls) + label + '<b>' + pctUncapped(totals[key], goals[key]) + '%<small> of goal</small></b></div>';
    }
    document.getElementById('view').innerHTML =
      '<div class="overview-plain">' +
        '<div class="bal-head"><h3 class="section-label">Today\'s balance</h3><span>Drag to spin</span></div>' +
        '<div class="balance-card">' +
          '<div class="balance-stage">' +
            '<div class="model-stage" id="modelStage"></div>' + tagsHtml +
            '<div class="model-status" id="modelStatus">' +
              '<span id="modelStatusText">Loading 3D model…</span>' +
              '<div class="model-bar" id="modelBarWrap"><i id="modelBar"></i></div>' +
            '</div>' +
          '</div>' +
          '<div class="balance-foot"><span>' + Math.round(totals.calories).toLocaleString() + ' / ' + goals.calories.toLocaleString() + ' kcal</span>' +
            '<b' + (left < 0 ? ' class="over"' : '') + '>' + Math.abs(Math.round(left)).toLocaleString() + (left < 0 ? ' over' : ' left') + '</b></div>' +
          '<div class="balance-chips">' + chip('Protein', 'protein', 'protein') + chip('Carbs', 'carbs', 'carbs') + chip('Fat', 'fat', 'fat') + '</div>' +
        '</div>' +
        insightsExtraParts().stats +
        weightCardHtml() +
        weeklyBodyHtml() +
      '</div>';
    try {
      Model3D.mount(document.getElementById('modelStage'), PYRAMID_FACES.map(function(f, k){
        var a = f.side * Math.PI / 2;
        var nx = Math.round(Math.sin(a)), nz = Math.round(Math.cos(a)); // side k faces +z, +x, -z, -x
        return { el: document.getElementById('faceTag' + k), pos: [f.r * nx, f.y, f.r * nz], normal: [nx, nz] };
      }));
    } catch (err){
      console.error('SaviorFuel: 3D panel failed to start —', err);
    }
  }







  // Each side of the 3D pyramid stands for one nutrient. A small tag
  // (ring + amount) is pinned to that side of the model and travels
  // with it as it turns. Order = the side facing the camera at
  // 0 / 90 / 180 / 270 degrees (+z, +x, -z, -x in the model's own
  // coordinates; one side has no tag now that fibre is gone). y = height of the tag on the pyramid, r = how far
  // out the food surface is at that height (measured from the model).
  var PYRAMID_FACES = [
    { key: 'protein', label: 'Protein', y: 0.44, r: 0.245, side: 0 },
    { key: 'carbs',   label: 'Carbs',   y: 0.08, r: 0.47,  side: 1 },
    { key: 'water',   label: 'Water',   y: 0.26, r: 0.345, side: 2, unit: 'ml' },
    { key: 'fat',     label: 'Fat',     y: 0.60, r: 0.145, side: 3 }
  ];
  var FACE_RING_R = 15;
  var FACE_RING_C = 2 * Math.PI * FACE_RING_R;

  function faceTagHtml(faceIndex, totals, goals){
    var f = PYRAMID_FACES[faceIndex];
    var value = f.key === 'water' ? waterFor(todayKey()) : (totals[f.key] || 0);
    var goal = goals[f.key] || 0;
    var percent = pctUncapped(value, goal);
    var over = percent > 100;
    var offset = FACE_RING_C * (1 - Math.min(percent, 100) / 100);
    return '<div class="face-tag" id="faceTag' + faceIndex + '">' +
      '<div class="face-ring">' +
        '<svg viewBox="0 0 38 38">' +
          '<circle class="face-ring-track" cx="19" cy="19" r="' + FACE_RING_R + '"></circle>' +
          '<circle class="face-ring-fill ' + f.key + (over ? ' over' : '') + '" cx="19" cy="19" r="' + FACE_RING_R + '" ' +
            'style="stroke-dasharray:' + FACE_RING_C.toFixed(2) + ';--full:' + FACE_RING_C.toFixed(2) + ';--off:' + offset.toFixed(2) + ';"></circle>' +
        '</svg>' +
        '<div class="face-ring-pct' + (over ? ' over' : '') + '">' + percent + '%</div>' +
      '</div>' +
      '<div>' +
        '<div class="face-name">' + f.label + '</div>' +
        '<div class="face-amount' + (over ? ' over' : '') + '">' + Math.round(value) + ' / ' + goal + (f.unit || 'g') + '</div>' +
      '</div>' +
    '</div>';
  }


  // Calories per meal time (Breakfast, Lunch ...) for a list of meals, in
  // the fixed meal order; meals with no category (logged before meal
  // times existed) fall into "Other". Only meal times that have
  // something logged are returned.
  function mealBreakdown(meals){
    var blank = function(id, label){ return { id: id, label: label, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, count: 0 }; };
    var rows = MEAL_CATEGORIES.map(function(c){ return blank(c.id, c.label); });
    var other = blank('other', 'Other');
    meals.forEach(function(m){
      var row = rows.filter(function(r){ return r.id === m.category; })[0] || other;
      row.kcal += m.calories || 0;
      row.protein += m.protein || 0;
      row.carbs += m.carbs || 0;
      row.fat += m.fat || 0;
      row.fiber += m.fiber || 0;
      row.count += 1;
    });
    if (other.count > 0) rows.push(other);
    return rows.filter(function(r){ return r.count > 0; }).map(function(r){
      return { id: r.id, label: r.label, kcal: Math.round(r.kcal), protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber, count: r.count };
    });
  }








  // The last 7 calendar days (today plus the 6 before it) worked out
  // from the meals: per-day totals, plus the numbers both Weekly views
  // share. days[0] is six days ago, days[6] is today.
  function weekData(){
    var g = STORE.goals;
    var days = [];
    var weekMeals = [];
    for (var d = 6; d >= 0; d--){
      var key = dateKeyDaysAgo(d);
      var dayMeals = mealsForDay(key);
      var t = totalsFor(dayMeals);
      weekMeals = weekMeals.concat(dayMeals);
      days.push({
        label: d === 0 ? 'Today' : new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }),
        isToday: d === 0,
        logged: dayMeals.length > 0,
        total: Math.round(t.calories),
        t: t,
        byMeal: mealBreakdown(dayMeals)
      });
    }
    var loggedDays = days.filter(function(x){ return x.logged; });
    var sum = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    loggedDays.forEach(function(x){
      Object.keys(sum).forEach(function(k){ sum[k] += x.t[k] || 0; });
    });
    return {
      days: days, goal: g.calories, goals: g, loggedDays: loggedDays, sum: sum,
      byMeal: mealBreakdown(weekMeals), weekMeals: weekMeals,
      avg: function(k){ return loggedDays.length ? sum[k] / loggedDays.length : 0; },
      highest: loggedDays.length ? Math.max.apply(null, loggedDays.map(function(x){ return x.total; })) : 0
    };
  }


