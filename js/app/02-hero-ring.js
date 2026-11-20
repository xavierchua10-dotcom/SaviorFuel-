  function heroRingSvg(totals, g){
    var vals = { cal: [totals.calories, g.calories], protein: [totals.protein, g.protein], carbs: [totals.carbs, g.carbs], fat: [totals.fat, g.fat] };
    var out = '<svg class="hero-ring-svg" viewBox="0 0 260 260" aria-hidden="true">';
    ring3dData = {};
    HERO_RINGS.forEach(function(rg){
      var c = 2 * Math.PI * rg.r;
      var v = vals[rg.id];
      var frac = v[1] > 0 ? Math.min(v[0] / v[1], 1) : 0;
      var over = v[1] > 0 && v[0] > v[1];
      ring3dData[rg.id] = { frac: frac, over: over };
      out += '<circle class="hero-ring-track" cx="130" cy="130" r="' + rg.r + '" style="stroke-width:' + rg.w + '"></circle>';
      if (frac > 0){
        out += '<circle class="hero-ring-fill ring-' + rg.id + (over && rg.id === 'cal' ? ' over' : '') + '" cx="130" cy="130" r="' + rg.r + '" ' +
          'style="stroke-width:' + rg.w + ';stroke-dasharray:' + c.toFixed(2) + ';stroke-dashoffset:' + (c * (1 - frac)).toFixed(2) + '"></circle>';
      }
    });
    return out + '</svg>';
  }


  /* =========================================================
     3D hero ring. The SVG above is the always-works version; once
     Three.js (same CDN copy the Insights pyramid uses) is ready, a
     canvas is laid over it with glossy extruded rings. Drag sideways
     to spin it; it coasts, then eases back to face front. One renderer
     is kept and moved into each fresh .hero-ring, so re-rendering the
     Log tab never creates a new WebGL context.
     ========================================================= */
  var ring3dData = null;
  var ring3d = { state: 'idle', canvas: null, renderer: null, scene: null, camera: null, group: null,
    size: 0, rot: 0, vel: 0, drag: null, raf: 0, last: 0, idleAt: 0 };
  var RINGS3D = [
    { id: 'cal',     r: 3.15, w: 0.5,  css: 'var(--c-cal)' },
    { id: 'protein', r: 2.6,  w: 0.36, css: 'var(--c-protein)' },
    { id: 'carbs',   r: 2.12, w: 0.36, css: 'var(--c-carbs)' },
    { id: 'fat',     r: 1.64, w: 0.36, css: 'var(--c-fat)' }
  ];

  function ring3dColor(expr){
    var probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:' + expr;
    document.body.appendChild(probe);
    var c = getComputedStyle(probe).color;
    probe.remove();
    return new THREE.Color(c).convertSRGBToLinear();
  }
  function ring3dAnnulus(ri, ro, a0, a1){
    var sh = new THREE.Shape();
    sh.absarc(0, 0, ro, a0, a1, true);
    sh.absarc(0, 0, ri, a1, a0, false);
    sh.closePath();
    return sh;
  }

  function ring3dBuild(){
    var r = ring3d, g = r.group, T = THREE;
    while (g.children.length){
      var old = g.children.pop();
      if (old.geometry) old.geometry.dispose();
      if (old.material) old.material.dispose();
    }
    var trackCol = ring3dColor('var(--panel-2)');
    trackCol.multiplyScalar(trackCol.r + trackCol.g + trackCol.b > 1.5 ? 0.8 : 0.62);   // lighter themes need less darkening
    var TH = 0.35, LIFT = 0.2, BV = 0.04, TAU = Math.PI * 2, A0 = Math.PI / 2;
    RINGS3D.forEach(function(rg){
      var d = (ring3dData && ring3dData[rg.id]) || { frac: 0, over: false };
      var ri = rg.r - rg.w / 2, ro = rg.r + rg.w / 2;
      var track = new T.Mesh(
        new T.ExtrudeGeometry(ring3dAnnulus(ri, ro, A0, A0 - TAU + 0.0001), { depth: TH, bevelEnabled: true, bevelSize: BV, bevelThickness: BV, bevelSegments: 3, curveSegments: 48 }),
        new T.MeshStandardMaterial({ color: trackCol, roughness: 0.55, metalness: 0.1 }));
      track.rotation.x = -Math.PI / 2;
      g.add(track);
      if (d.frac <= 0) return;
      var frac = Math.max(d.frac, 0.015);
      var col = ring3dColor(d.over && rg.id === 'cal' ? 'var(--accent-2)' : rg.css);
      var mat = new T.MeshPhysicalMaterial({ color: col, roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.15, emissive: col, emissiveIntensity: 0.12 });
      var a1 = A0 - TAU * Math.min(frac, 0.9999);
      var arc = new T.Mesh(
        new T.ExtrudeGeometry(ring3dAnnulus(ri + 0.03, ro - 0.03, A0, a1), { depth: TH + LIFT, bevelEnabled: true, bevelSize: BV * 1.2, bevelThickness: BV * 1.6, bevelSegments: 4, curveSegments: 48 }),
        mat);
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = TH * 0.5;
      g.add(arc);
      if (frac < 0.999){   // round end caps
        [A0, a1].forEach(function(a){
          var cap = new T.Mesh(new T.CylinderGeometry(rg.w / 2 - 0.03, rg.w / 2 - 0.03, TH + LIFT + BV * 2.8, 28), mat);
          cap.position.set(Math.cos(a) * rg.r, TH * 0.5 + (TH + LIFT) / 2, -Math.sin(a) * rg.r);
          g.add(cap);
        });
      }
    });
    r.group.rotation.y = r.rot;
    ring3dKick();
  }

  function ring3dInit(){
    var T = THREE, r = ring3d;
    r.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.renderer.outputEncoding = T.sRGBEncoding;
    r.renderer.setClearColor(0x000000, 0);
    r.canvas = r.renderer.domElement;
    r.canvas.className = 'ring3d';
    r.canvas.setAttribute('aria-hidden', 'true');
    r.scene = new T.Scene();
    r.camera = new T.PerspectiveCamera(34.6, 1, 0.1, 100)   /* 30deg fov widened to match the 116% canvas, so the ring keeps its size but has room to spin */;
    r.camera.position.set(0, 10.4, 8.1);
    r.camera.lookAt(0, 0.2, 0);
    r.scene.add(new T.HemisphereLight(0xffffff, 0x303846, 0.55));
    var key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(-4, 9, 6);
    var back = new T.DirectionalLight(0x88aaff, 0.3); back.position.set(6, 3, -4);
    r.scene.add(key, back);
    r.group = new T.Group();
    r.scene.add(r.group);
    // Spin by dragging sideways. touch-action: pan-y lets a vertical swipe still scroll the page.
    r.canvas.addEventListener('pointerdown', function(e){
      r.drag = { id: e.pointerId, x: e.clientX, t: performance.now() };
      r.vel = 0;
      try { r.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      ring3dKick();
    });
    r.canvas.addEventListener('pointermove', function(e){
      if (!r.drag || r.drag.id !== e.pointerId) return;
      var now = performance.now(), dx = e.clientX - r.drag.x, dt = Math.max(1, now - r.drag.t) / 1000;
      var step = dx * 0.012;
      r.rot += step;
      r.vel = r.vel * 0.5 + (step / dt) * 0.5;
      r.drag.x = e.clientX; r.drag.t = now;
      ring3dKick();
    });
    var end = function(e){
      if (!r.drag || (e && r.drag.id !== e.pointerId)) return;
      r.drag = null;
      r.idleAt = performance.now();
      if (Math.abs(r.vel) > 14) r.vel = r.vel > 0 ? 14 : -14;
      ring3dKick();
    };
    r.canvas.addEventListener('pointerup', end);
    r.canvas.addEventListener('pointercancel', end);
    r.canvas.addEventListener('webglcontextlost', function(e){ e.preventDefault(); });
    r.canvas.addEventListener('webglcontextrestored', function(){ ring3dKick(); });
  }

  function ring3dKick(){
    if (!ring3d.raf) { ring3d.last = performance.now(); ring3d.raf = requestAnimationFrame(ring3dFrame); }
  }
  function ring3dFrame(now){
    var r = ring3d;
    r.raf = 0;
    if (!r.canvas || !r.canvas.isConnected) return;
    var dt = Math.min(0.05, Math.max(0.001, (now - r.last) / 1000));
    r.last = now;
    var moving = !!r.drag;
    if (!r.drag){
      if (Math.abs(r.vel) > 0.02){
        r.rot += r.vel * dt;
        r.vel *= Math.pow(0.06, dt);
        r.idleAt = now;
        moving = true;
      } else {
        r.vel = 0;
        var target = Math.round(r.rot / (Math.PI * 2)) * Math.PI * 2;   // nearest "facing front"
        if (Math.abs(target - r.rot) > 0.001 && now - r.idleAt > 2200){
          r.rot += (target - r.rot) * Math.min(1, dt * 2.6);
          moving = true;
        } else if (Math.abs(target - r.rot) > 0.001){
          moving = true;   // waiting out the idle delay
        } else {
          r.rot = target;
        }
      }
    }
    r.group.rotation.y = r.rot;
    r.renderer.render(r.scene, r.camera);
    if (moving) r.raf = requestAnimationFrame(ring3dFrame);
  }

  function ring3dAttach(host){
    var r = ring3d;
    var prev = r.canvas.parentNode;
    if (prev && prev !== host){
      prev.classList.remove('is3d');
      prev.removeChild(r.canvas);
    }
    var size = Math.round((host.clientWidth || 250) * 1.16);
    if (size !== r.size){
      r.size = size;
      r.renderer.setSize(size, size, false);
    }
    if (r.canvas.parentNode !== host) host.appendChild(r.canvas);
    host.classList.add('is3d');
  }

  function mountHeroRing3d(){
    var host = document.querySelector('.hero-ring');
    var r = ring3d;
    if (!host || !ring3dData || r.state === 'failed') return;
    if (r.state === 'ready'){ ring3dAttach(host); ring3dBuild(); return; }
    if (r.state === 'loading') return;
    r.state = 'loading';
    Promise.resolve()
      .then(function(){ if (typeof THREE === 'undefined') return loadScriptOnce(THREE_URL); })
      .then(function(){
        ring3dInit();
        r.state = 'ready';
        var h = document.querySelector('.hero-ring');
        if (h){
          if (!prefersReducedMotion()){ r.rot = -Math.PI * 1.1; r.idleAt = performance.now() - 2200; }  // a little spin-in the first time
          ring3dAttach(h); ring3dBuild();
        }
      })
      .catch(function(){ r.state = 'failed'; });
  }

  function macroTileHtml(label, value, goal, cls){
    var over = goal > 0 && value > goal;
    return '<div class="macro-tile">' +
      '<div class="macro-tile-label"><i class="dot ' + cls + '"></i>' + label + '</div>' +
      '<div class="macro-tile-val' + (over ? ' over' : '') + '">' + Math.round(value) + '<span>/' + goal + 'g</span></div>' +
    '</div>';
  }

  // Little line icons for protein / carbs / fat (drumstick, wheat, avocado), coloured like the macro.
  var MACRO_ICON_PATHS = {
    protein: '<path d="M3 12c2.5-4 6-6 10-6 3 0 5 1.8 6 3.5L22 7v10l-3-2.5C18 16.2 16 18 13 18c-4 0-7.5-2-10-6z"/><circle cx="8" cy="11" r=".9" fill="currentColor"/>',
    carbs: '<path d="M12 22V8"/><path d="M12 8c-2.5 0-3.5-2-3.5-4 2.5 0 3.5 2 3.5 4zM12 8c2.5 0 3.5-2 3.5-4-2.5 0-3.5 2-3.5 4z"/><path d="M12 14c-2.5 0-4-1.5-4-3.5 2.5 0 4 1.5 4 3.5zM12 14c2.5 0 4-1.5 4-3.5-2.5 0-4 1.5-4 3.5z"/><path d="M12 20c-2.5 0-4-1.5-4-3.5 2.5 0 4 1.5 4 3.5zM12 20c2.5 0 4-1.5 4-3.5-2.5 0-4 1.5-4 3.5z"/>',
    fat: '<path d="M12 2.5c2.2 0 3.2 2.5 3.6 4.6.3 1.6 1.4 2.6 2.4 4.2 1.9 3 .6 9.7-6 9.7S4.1 14.3 6 11.3c1-1.6 2.1-2.6 2.4-4.2C8.8 5 9.8 2.5 12 2.5z"/><circle cx="12" cy="14.5" r="2.8"/>'
  };
  function macroIconHtml(cls){
    return '<svg class="mi mi-' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (MACRO_ICON_PATHS[cls] || '') + '</svg>';
  }

  function macroLineHtml(label, value, goal, cls){
    var over = goal > 0 && value > goal;
    return '<div class="log-macro">' + macroIconHtml(cls) + '<span class="lm-n">' + label + '</span>' +
      '<span class="lm-v' + (over ? ' over' : '') + '">' + Math.round(value) + '<small>/' + goal + 'g</small></span></div>';
  }

  function weekStripHtml(viewKey){
    var today = todayKey();
    var start = weekStartKey(viewKey);
    var names = ['M','T','W','T','F','S','S'];
    var html = '<div class="week-strip" role="tablist" aria-label="Pick a day">';
    for (var i = 0; i < 7; i++){
      var k = addDaysKey(start, i);
      var future = k > today;
      var dayNum = Number(k.slice(8));
      html += '<button type="button" class="week-day' + (k === viewKey ? ' active' : '') + (k === today ? ' is-today' : '') + '"' +
        (future ? ' disabled' : '') + ' data-action="set-log-day" data-day="' + k + '" aria-label="' + esc(formatDateLabel(k)) + '">' +
        '<span class="wd-name">' + names[i] + '</span><span class="wd-num">' + dayNum + '</span></button>';
    }
    return html + '</div>';
  }

