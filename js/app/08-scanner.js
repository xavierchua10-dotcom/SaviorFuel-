  // mode: 'barcode' (watch for a barcode only), 'photo' (just the shutter
  // button — works even in browsers with no barcode reader), or nothing =
  // both at once (the scan button in food search).
  function openScanner(mode){
    mode = mode || 'both';
    var canBarcode = typeof BarcodeDetector !== 'undefined';
    if (!canBarcode){
      if (mode === 'barcode'){
        alert('Barcode scanning isn\'t supported in this browser. Try the installed app, or search by name instead.');
        return;
      }
      mode = 'photo'; // no barcode reader here, but the photo button still works
    }
    var overlay = document.getElementById('scanOverlay');
    var video = document.getElementById('scanVideo');
    var statusEl = document.getElementById('scanStatus');

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(function(stream){
        scanState.stream = stream;
        video.srcObject = stream;
        overlay.classList.remove('hidden');
        overlay.classList.toggle('photo-mode', mode !== 'barcode');
        document.getElementById('scanCaptureBtn').classList.toggle('hidden', mode === 'barcode');
        scanState.detector = (mode === 'photo') ? null : makeBarcodeDetector();
        statusEl.textContent = mode === 'photo' ? 'Fit your whole plate in the frame'
          : mode === 'barcode' ? 'Point the camera at a barcode'
          : 'Point at a barcode, or snap a photo of the food';
        var left = aiScanEnabled() ? aiLeftGet() : null;
        document.getElementById('scanPill').textContent = mode === 'barcode' ? 'Barcode scan'
          : mode === 'both' ? 'Barcode or photo'
          : (aiScanEnabled() ? 'AI photo' + (left == null ? '' : ' \u00b7 ' + left + ' scan' + (left === 1 ? '' : 's') + ' left') : 'Photo');
        document.getElementById('scanGalBtn').classList.toggle('unavail', mode === 'barcode');
        setupTorch(stream);
        if (scanState.detector) scanLoop();
      })
      .catch(function(err){
        console.error('SaviorFuel: camera access failed —', err);
        alert('Couldn\'t access the camera. Check camera permission for this app in your phone settings, or search by name instead.');
      });
  }

  function setupTorch(stream){
    var btn = document.getElementById('scanTorchBtn');
    btn.classList.remove('on');
    btn.setAttribute('aria-pressed', 'false');
    var ok = false;
    try {
      var track = stream.getVideoTracks()[0];
      var caps = track && track.getCapabilities ? track.getCapabilities() : null;
      ok = !!(caps && caps.torch);
    } catch (e){ ok = false; }
    btn.classList.toggle('unavail', !ok);
  }

  function toggleTorch(){
    var btn = document.getElementById('scanTorchBtn');
    if (!scanState.stream) return;
    var track = scanState.stream.getVideoTracks()[0];
    var want = !btn.classList.contains('on');
    track.applyConstraints({ advanced: [{ torch: want }] }).then(function(){
      btn.classList.toggle('on', want);
      btn.setAttribute('aria-pressed', want ? 'true' : 'false');
    }).catch(function(){ btn.classList.add('unavail'); });
  }

  // A meal photo already on the phone: same scan, no camera shot.
  function scanFromFile(file){
    if (!file || !scanState.stream) return;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function(){
      URL.revokeObjectURL(url);
      var max = 1600;
      var sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * sc));
      c.height = Math.max(1, Math.round(img.naturalHeight * sc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      captureFoodPhoto(c);
    };
    img.onerror = function(){
      URL.revokeObjectURL(url);
      document.getElementById('scanStatus').textContent = 'Couldn\'t open that photo. Try another one.';
    };
    img.src = url;
  }
  document.getElementById('scanFile').addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    scanFromFile(f);
  });

  function makeBarcodeDetector(){
    var want = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
    try { return new BarcodeDetector({ formats: want }); }
    catch (err){ try { return new BarcodeDetector(); } catch (err2){ return null; } }
  }

  function scanLoop(){
    var video = document.getElementById('scanVideo');
    if (!scanState.stream || !scanState.detector) return; // scanner closed mid-loop, or photo-only mode
    scanState.detector.detect(video)
      .then(function(codes){
        if (codes.length > 0){
          onBarcodeDetected(codes[0].rawValue);
        } else {
          scanState.loopId = requestAnimationFrame(scanLoop);
        }
      })
      .catch(function(){
        // detect() can throw transiently (e.g. video not ready yet) — just keep trying
        scanState.loopId = requestAnimationFrame(scanLoop);
      });
  }

  function closeScanner(){
    if (scanState.stream){
      scanState.stream.getTracks().forEach(function(t){ t.stop(); });
    }
    if (scanState.loopId) cancelAnimationFrame(scanState.loopId);
    scanState.stream = null;
    scanState.loopId = null;
    document.getElementById('scanOverlay').classList.add('hidden');
    document.getElementById('scanOverlay').classList.remove('analysing');
    if (typeof analysing !== 'undefined'){ analysing.timers.forEach(clearTimeout); analysing.timers = []; }
    document.getElementById('scanCaptureBtn').classList.remove('loading'); // reset for next open
  }

  // ---- Barcode lookup: no single database has every product, so try, in order:
  // (1) foods the person saved against this barcode, (2) Open Food Facts,
  // (3) USDA branded foods. If none has it, offer to save it once from the
  // label — next scan of that barcode then fills in instantly.
  function stripZeros(c){ return String(c || '').replace(/^0+/, ''); }

  function offKcal(n){
    var k = Number(n['energy-kcal_100g']);
    if (k > 0) return k;
    var kj = Number(n['energy-kj_100g'] || n['energy_100g']);
    if (kj > 0) return Math.round(kj / 4.184);
    var fromMacros = 4 * (Number(n['proteins_100g']) || 0) + 4 * (Number(n['carbohydrates_100g']) || 0) + 9 * (Number(n['fat_100g']) || 0);
    return fromMacros > 0 ? Math.round(fromMacros) : 0;
  }

  function lookupBarcodeOff(code){
    var url = 'https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json' +
      '?fields=product_name,brands,nutriments,serving_quantity,serving_size,image_front_thumb_url,image_thumb_url,image_small_url';
    return fetch(url).then(function(res){ return res.json(); }).then(function(data){
      if (data.status !== 1 || !data.product) return null;
      var p = data.product, n = p.nutriments || {};
      var kcal = offKcal(n);
      p._source = 'off';
      p._image = p.image_front_thumb_url || p.image_thumb_url || p.image_small_url || '';
      p._hasNutrition = kcal > 0;
      if (kcal > 0){ n = Object.assign({}, n); n['energy-kcal_100g'] = kcal; p.nutriments = n; }
      return p;
    });
  }

  function lookupBarcodeUsda(code){
    var url = FOODS_PROXY_URL + '/usda?q=' + encodeURIComponent(code) + '&type=branded';
    return fetch(url).then(function(res){ if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); }).then(function(data){
      var want = stripZeros(code);
      var hit = (data.foods || []).filter(function(f){ return stripZeros(f.gtinUpc) === want; })[0];
      if (!hit) return null;
      var p = usdaToProductShape(hit);
      if (p.nutriments['energy-kcal_100g'] == null) return null;
      var sz = Number(hit.servingSize);
      if (sz > 0 && /^g/i.test(hit.servingSizeUnit || '')){
        var label = String(hit.householdServingFullText || 'serving').replace(/\s+/g, ' ').trim();
        p._measures = [{ label: label, grams: sz }];
      }
      p._hasNutrition = true;
      return p;
    });
  }

  function barcodeNotFound(code, name){
    closeScanner();
    closeFoodSearchOverlay();
    openFoodSheet('mine', null, { barcode: code, name: name || '', hint: 'This barcode isn’t in the food databases yet. Add it once from the label — next time you scan it, it fills in instantly.' });
  }

  function openBarcodeProduct(p){
    closeScanner();
    ui.lastSearchProducts = [p];
    pickFoodResult(0);
  }

  function onBarcodeDetected(code){
    var statusEl = document.getElementById('scanStatus');
    statusEl.textContent = 'Found ' + code + ' — looking it up...';
    if (scanState.loopId) cancelAnimationFrame(scanState.loopId);
    scanState.loopId = null;

    var mine = (STORE.myFoods || []).filter(function(f){ return f.barcode && stripZeros(f.barcode) === stripZeros(code); })[0];
    if (mine){ openBarcodeProduct(myFoodToProduct(mine)); return; }

    var partialName = '';
    lookupBarcodeOff(code)
      .catch(function(err){ console.error('SaviorFuel: Open Food Facts lookup failed —', err); return 'offline'; })
      .then(function(p){
        if (p && p !== 'offline'){
          if (p._hasNutrition){ openBarcodeProduct(p); return null; }
          partialName = p.product_name || '';
        }
        statusEl.textContent = 'Checking another database...';
        return lookupBarcodeUsda(code).catch(function(err){ console.error('SaviorFuel: USDA barcode lookup failed —', err); return null; })
          .then(function(u){
            if (u){ openBarcodeProduct(u); return; }
            if (p === 'offline'){
              closeScanner();
              alert('Lookup failed — check your connection and try again, or search by name instead.');
              return;
            }
            barcodeNotFound(code, partialName);
          });
      });
  }

  /* =========================================================
     ON-DEVICE FOOD PHOTO RECOGNITION — same camera view as the
     barcode scanner above (one lens, one permission prompt): the
     barcode loop keeps running in the background, and this button
     lets you snap a frame instead when there's no barcode to find.
     TFJS + MobileNet (Google's official, maintained pretrained
     model — not a food-specific one, there isn't a reliably-hosted
     one) load lazily from CDN the first time this is actually used,
     not on every app load, and stay cached in memory for the rest
     of the session once loaded. MobileNet only knows ImageNet's
     1000 general categories, so its guess is fed into the existing
     search rather than auto-logged — treat it as a head start on
     typing, not a real identification, especially for Malaysian
     dishes it has no concept of.
     ========================================================= */
  var foodClassifierState = { model: null, loading: null };

  function loadScriptOnce(src){
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = src;
      s.onload = function(){ resolve(); };
      s.onerror = function(){ reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadFoodClassifier(){
    if (foodClassifierState.model) return Promise.resolve(foodClassifierState.model);
    if (foodClassifierState.loading) return foodClassifierState.loading;

    foodClassifierState.loading = Promise.resolve()
      .then(function(){
        if (typeof tf === 'undefined') return loadScriptOnce('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');
      })
      .then(function(){
        if (typeof mobilenet === 'undefined') return loadScriptOnce('https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet');
      })
      .then(function(){ return mobilenet.load(); })
      .then(function(model){
        foodClassifierState.model = model;
        foodClassifierState.loading = null;
        return model;
      })
      .catch(function(err){
        foodClassifierState.loading = null;
        throw err;
      });

    return foodClassifierState.loading;
  }

  // The video fills the screen with object-fit:cover, so work out which
  // part of the real camera frame sits under the on-screen guide frame.
  function cropToFrame(source, vw, vh){
    var full = function(){
      var c = document.createElement('canvas');
      c.width = vw; c.height = vh;
      c.getContext('2d').drawImage(source, 0, 0);
      return c;
    };
    try {
      var video = document.getElementById('scanVideo');
      var frame = document.querySelector('.scan-overlay-frame');
      var vr = video.getBoundingClientRect();
      var fr = frame.getBoundingClientRect();
      if (!vw || !vh || !vr.width || !vr.height || !fr.width || !fr.height) return full();
      var sc = Math.max(vr.width / vw, vr.height / vh);
      var ox = (vr.width - vw * sc) / 2, oy = (vr.height - vh * sc) / 2;
      var sx = (fr.left - vr.left - ox) / sc, sy = (fr.top - vr.top - oy) / sc;
      var sw = fr.width / sc, sh = fr.height / sc;
      sx = Math.max(0, sx); sy = Math.max(0, sy);
      sw = Math.min(vw - sx, sw); sh = Math.min(vh - sy, sh);
      if (sw < 50 || sh < 50) return full();
      var c = document.createElement('canvas');
      c.width = Math.round(sw); c.height = Math.round(sh);
      c.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c;
    } catch (e){ return full(); }
  }

  function captureFoodPhoto(srcCanvas){
    if (!scanState.stream) return; // scanner already closed
    var video = document.getElementById('scanVideo');
    var statusEl = document.getElementById('scanStatus');
    var captureBtn = document.getElementById('scanCaptureBtn');

    // Stop only the barcode-detection loop, not the camera stream —
    // the video keeps showing behind the status text while the model
    // loads/runs, same as the "Found ... looking it up" moment in
    // onBarcodeDetected(). The frame itself is grabbed right now
    // regardless, so nothing changes about what gets classified.
    if (scanState.loopId) cancelAnimationFrame(scanState.loopId);
    scanState.loopId = null;
    captureBtn.classList.add('loading');

    // What gets scanned and saved is exactly what sits inside the green frame.
    var canvas = srcCanvas || cropToFrame(video, video.videoWidth, video.videoHeight);

    // AI scan (Gemini via the proxy) when it's set up and we're online;
    // otherwise — or if it fails — the basic on-device guess below.
    if (aiScanEnabled()){
      aiScan.photo = aiPhotoThumb(canvas);
      startAnalysing();
      runAiScan(canvas).catch(function(err){
        stopAnalysing();
        if (err && err.declined){ classifyFoodPhotoLegacy(canvas); return; }
        console.error('SaviorFuel: AI food scan failed —', err);
        if (err && err.status){
          // The scanner answered with a problem (out of scans, key not
          // set, AI busy...): say what it said, and stay on the camera
          // so barcode scanning still works. Only a dead connection
          // falls back to the basic on-device guess below.
          statusEl.textContent = (err.userMessage || 'Scan failed.') + ' (' + (err.code || err.status) + ')';
          captureBtn.classList.remove('loading');
          if (scanState.stream) scanLoop();
          return;
        }
        statusEl.textContent = 'AI scan unavailable — trying basic recognition...';
        classifyFoodPhotoLegacy(canvas);
      });
      return;
    }
    classifyFoodPhotoLegacy(canvas);
  }

  function classifyFoodPhotoLegacy(canvas){
    document.getElementById('scanStatus').textContent = 'Loading food recognition...';
    loadFoodClassifier()
      .then(function(model){
        document.getElementById('scanStatus').textContent = 'Identifying...';
        return model.classify(canvas);
      })
      .then(function(predictions){
        closeScanner();
        // MobileNet's ImageNet labels are comma-separated synonyms
        // (e.g. "cheeseburger, hamburger") — just use the first.
        var guess = predictions[0] ? predictions[0].className.split(',')[0].trim() : '';
        openFoodSearchOverlay();
        if (guess){
          document.getElementById('foodSearchInput').value = guess;
          runFoodSearch(guess);
        }
      })
      .catch(function(err){
        console.error('SaviorFuel: food photo recognition failed —', err);
        closeScanner();
        alert('Couldn\'t load food recognition — check your connection, or search by name instead.');
      });
  }

  /* =========================================================
     AI FOOD SCAN — snap a photo, an AI (Google Gemini, reached
     through the small proxy in /ai-proxy) lists what's on the plate
     with estimated grams and nutrition, and you confirm/edit it
     before anything is logged. The API key is NOT in this file —
     the proxy holds it, applies daily limits, and only accepts
     requests from this app's own site. Leave AI_SCAN_URL empty and
     the camera button just uses the basic on-device guess above.
     ========================================================= */
  var AI_SCAN_URL = 'https://saviorfuel-ai.xavierchua10.workers.dev'; // Cloudflare Worker (repo: Saviorfuelwebhook)
  var aiScan = { items: [], category: 'lunch', photo: '' };

