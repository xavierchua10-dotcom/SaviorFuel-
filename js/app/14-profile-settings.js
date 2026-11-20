  // ---- Profile tab: numbers for the hero ----
  function profileStatsFuel(){
    var map = dayStatsMap();
    var keys = Object.keys(map).sort();
    var avgSum = 0, avgN = 0;
    for (var d = 0; d < 7; d++){
      var day = map[dateKeyDaysAgo(d)];
      if (day){ avgSum += day.calories; avgN++; }
    }
    var counts = {};
    STORE.meals.forEach(function(m){
      var nm = String(m.name || '').trim();
      if (!nm) return;
      var k = nm.toLowerCase();
      if (!counts[k]) counts[k] = { name: nm, n: 0 };
      counts[k].n++;
    });
    var top = Object.keys(counts).map(function(k){ return counts[k]; })
      .sort(function(a, b){ return b.n - a.n; }).slice(0, 3);
    var since = '';
    if (keys.length){
      var p = keys[0].split('-');
      since = new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    var si = streakInfo(map);
    return { streak: si.current, best: si.best, days: keys.length, meals: STORE.meals.length,
             avg: avgN ? Math.round(avgSum / avgN) : 0, top: top, since: since };
  }

  // Tap the weight tile on Profile: opens the weight panel (daily goals only change if you press Set my daily goals).
  function editWeight(){ openWeightPanel(); }

  function editProfileName(){ openNamePanel(); }

  // Share profile: draws the stats on a canvas and opens the share sheet
  // (or downloads the picture where sharing files isn't supported).
  function shareProfile(){
    var ps = profileStatsFuel();
    var nm = (STORE.appSettings.name && String(STORE.appSettings.name).trim()) || 'SaviorFuel';
    var W = 1080, H = 1350;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1b2314'); g.addColorStop(0.55, '#14161a'); g.addColorStop(1, '#14161a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(166,227,107,.55)'; x.lineWidth = 4;
    x.beginPath(); x.roundRect(40, 40, W - 80, H - 80, 48); x.stroke();
    function txt(t, px, py, font, color, align, ls){
      x.font = font; x.fillStyle = color; x.textAlign = align || 'left';
      if ('letterSpacing' in x) x.letterSpacing = ls || '0px';
      x.fillText(t, px, py);
    }
    function draw(logo){
      if (logo) x.drawImage(logo, 90, 100, 120, 120);
      txt(nm.toUpperCase(), 240, 175, "700 76px 'Oswald',sans-serif", '#e9e6df');
      txt(ps.since ? 'LOGGING SINCE ' + ps.since.toUpperCase() : 'SAVIORFUEL', 242, 222, "500 28px 'JetBrains Mono',monospace", '#a6e36b', 'left', '3px');
      var cells = [
        [String(ps.streak), 'DAY STREAK', '#a6e36b'],
        [String(ps.days), 'DAYS LOGGED', '#e9e6df'],
        [String(ps.meals), 'MEALS LOGGED', '#e9e6df'],
        [String(ps.best), 'BEST STREAK', '#a6e36b']
      ];
      cells.forEach(function(cl, i){
        var cx = 90 + (i % 2) * 460, cy = 300 + Math.floor(i / 2) * 250;
        x.fillStyle = '#1f232b'; x.strokeStyle = '#434a57'; x.lineWidth = 3;
        x.beginPath(); x.roundRect(cx, cy, 440, 210, 32); x.fill(); x.stroke();
        txt(cl[0], cx + 36, cy + 118, "700 100px 'Oswald',sans-serif", cl[2]);
        txt(cl[1], cx + 38, cy + 172, "700 26px 'JetBrains Mono',monospace", '#a1a7b0', 'left', '4px');
      });
      txt('TOP FOODS', 100, 860, "700 28px 'JetBrains Mono',monospace", '#a1a7b0', 'left', '5px');
      var list = ps.top.length ? ps.top : [{ name: 'Log a few meals to fill this in', n: 0 }];
      list.forEach(function(f, i){
        var y = 930 + i * 100;
        x.strokeStyle = '#343a45'; x.lineWidth = 2; x.beginPath(); x.moveTo(90, y - 56); x.lineTo(W - 90, y - 56); x.stroke();
        var label = f.name.length > 26 ? f.name.slice(0, 25) + '\u2026' : f.name;
        txt(label, 100, y, "600 44px 'Inter',sans-serif", '#e9e6df');
        if (f.n) txt(f.n + ' \u00D7', W - 100, y, "700 52px 'Oswald',sans-serif", '#a6e36b', 'right');
      });
      txt('SAVIORFUEL', W / 2, H - 100, "700 34px 'Oswald',sans-serif", '#a6e36b', 'center', '10px');
      c.toBlob(function(blob){
        if (!blob) return;
        var file = new File([blob], 'saviorfuel-profile.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })){
          navigator.share({ files: [file], title: 'My SaviorFuel profile' }).catch(function(){});
        } else {
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'saviorfuel-profile.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
        }
      }, 'image/png');
    }
    var go = function(){ try { draw(img); } catch (err){ console.error(err); } };
    var img = new Image();
    img.onload = go; img.onerror = function(){ img = null; go(); };
    img.src = 'images/logo-mark.png';
    if (document.fonts && document.fonts.load){ /* fonts are already in use on screen */ }
  }

  // Share my week: draws the last 7 days as a picture (bars, goal line,
  // average, days logged, days on target) and opens the share sheet, or
  // downloads it where sharing files isn't supported.
  function shareWeek(){
    var wd = weekData();
    if (!wd.loggedDays.length) return;
    var g = wd.goals;
    var nm = (STORE.appSettings.name && String(STORE.appSettings.name).trim()) || '';
    var W = 1080, H = 1350;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    x.fillStyle = '#14161a'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(166,227,107,.55)'; x.lineWidth = 4;
    x.beginPath(); x.roundRect(40, 40, W - 80, H - 80, 48); x.stroke();
    function txt(t, px, py, font, color, align, ls){
      x.font = font; x.fillStyle = color; x.textAlign = align || 'left';
      if ('letterSpacing' in x) x.letterSpacing = ls || '0px';
      x.fillText(t, px, py);
    }
    function fmtDay(k){ return new Date(k + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    var onTarget = g.calories > 0 ? wd.loggedDays.filter(function(d){ return dayStatus(d.total, g.calories) === 'on'; }).length : 0;
    var avg = Math.round(wd.avg('calories'));
    function draw(logo){
      if (logo) x.drawImage(logo, 90, 100, 120, 120);
      txt('YOUR WEEK', 240, 175, "700 76px 'Oswald',sans-serif", '#e9e6df');
      var sub = fmtDay(dateKeyDaysAgo(6)) + ' – ' + fmtDay(dateKeyDaysAgo(0));
      txt((nm ? nm.toUpperCase() + '  ·  ' : '') + sub.toUpperCase(), 242, 222, "500 28px 'JetBrains Mono',monospace", '#a6e36b', 'left', '3px');
      // bars
      var left = 100, right = W - 100, base = 800, top = 440, hgt = base - top;
      var maxV = Math.max(g.calories * 1.15, wd.highest, 1);
      var slot = (right - left) / 7, bw = 78;
      if (g.calories > 0){
        var gy = base - g.calories / maxV * hgt;
        x.strokeStyle = 'rgba(161,167,176,.7)'; x.lineWidth = 3; x.setLineDash([14, 12]);
        x.beginPath(); x.moveTo(left, gy); x.lineTo(right, gy); x.stroke(); x.setLineDash([]);
        x.strokeStyle = 'rgba(161,167,176,.7)'; x.lineWidth = 3; x.setLineDash([14, 12]);
        x.beginPath(); x.moveTo(left, 330); x.lineTo(left + 70, 330); x.stroke(); x.setLineDash([]);
        txt('GOAL ' + Math.round(g.calories).toLocaleString() + ' KCAL', left + 90, 339, "700 24px 'JetBrains Mono',monospace", '#a1a7b0', 'left', '3px');
      }
      wd.days.forEach(function(d, i){
        var cx = left + slot * i + slot / 2;
        var h = d.logged ? Math.max(8, d.total / maxV * hgt) : 8;
        var over = g.calories > 0 && d.total > g.calories * 1.1;
        x.fillStyle = !d.logged ? '#333a44' : (over ? '#ff8a65' : '#a6e36b');
        x.beginPath(); x.roundRect(cx - bw / 2, base - h, bw, h, 16); x.fill();
        if (d.logged){
          x.font = "600 26px 'JetBrains Mono',monospace"; x.textAlign = 'center';
          x.lineJoin = 'round'; x.lineWidth = 10; x.strokeStyle = '#14161a';
          x.strokeText(String(d.total), cx, base - h - 16);
          txt(String(d.total), cx, base - h - 16, "600 26px 'JetBrains Mono',monospace", '#e9e6df', 'center');
        }
        txt(d.isToday ? 'Today' : d.label, cx, base + 52, "600 28px 'Inter',sans-serif", d.isToday ? '#a6e36b' : '#a1a7b0', 'center');
      });
      // stats
      var cells = [
        [avg.toLocaleString(), 'AVG KCAL', '#e9e6df'],
        [wd.loggedDays.length + '/7', 'DAYS LOGGED', '#a6e36b'],
        [g.calories > 0 ? String(onTarget) : '–', 'ON TARGET', '#a6e36b']
      ];
      cells.forEach(function(cl, i){
        var cx = 90 + i * 310, cy = 960;
        x.fillStyle = '#1f232b'; x.strokeStyle = '#434a57'; x.lineWidth = 3;
        x.beginPath(); x.roundRect(cx, cy, 280, 200, 32); x.fill(); x.stroke();
        txt(cl[0], cx + 32, cy + 112, "700 80px 'Oswald',sans-serif", cl[2]);
        txt(cl[1], cx + 34, cy + 166, "700 24px 'JetBrains Mono',monospace", '#a1a7b0', 'left', '3px');
      });
      txt('SAVIORFUEL', W / 2, H - 100, "700 34px 'Oswald',sans-serif", '#a6e36b', 'center', '10px');
      c.toBlob(function(blob){
        if (!blob) return;
        var file = new File([blob], 'saviorfuel-week.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })){
          navigator.share({ files: [file], title: 'My SaviorFuel week' }).catch(function(){});
        } else {
          var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'saviorfuel-week.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
        }
      }, 'image/png');
    }
    var img = new Image();
    var go = function(){ try { draw(img); } catch (err){ console.error(err); } };
    img.onload = go; img.onerror = function(){ img = null; go(); };
    img.src = 'images/logo-mark.png';
  }

  function renderSettings(){
    var g = STORE.goals;
    var s = STORE.appSettings;
    var p = STORE.profile;
    var imperial = s.unit === 'imperial';
    var goalLabel = (GOAL_OPTIONS.find(function(o){ return o.id === p.goal; }) || GOAL_OPTIONS[1]).label;
    var weightLabel = imperial ? Math.round(kgToLb(p.weightKg)) + ' lb' : p.weightKg + ' kg';

    // ---- hero: who you are + your logging stats
    var ps = profileStatsFuel();
    var nm = (s.name && String(s.name).trim()) || 'You';
    var statT = function(v, l, u, cls){ return '<div class="pf-stat ' + (cls || '') + '"><div class="pf-stat-v">' + v + (u ? ' <small>' + u + '</small>' : '') + '</div><div class="pf-stat-l">' + l + '</div></div>'; };
    var html = '<div class="pf-hero">' +
      '<div class="pf-id"><div class="pf-av"><img src="images/logo-mark.png" alt=""></div>' +
        '<div class="pf-id-tx"><div class="pf-name">' + esc(nm) + '</div>' +
        '<div class="pf-since">' + (ps.since ? 'Logging since <b>' + esc(ps.since) + '</b>' : 'Ready to log your first meal') + '</div></div></div>' +
      '<div class="pf-acts"><button type="button" class="pf-share" data-action="share-profile">Share profile</button>' +
        '<button type="button" class="pf-edit" data-action="edit-profile-name" aria-label="Edit name">' + SET_ICONS.edit + '</button></div>' +
    '</div>';
    // ---- quick stats + weight shortcut (tap weight to update it without opening My Plan)
    html += '<div class="pf-stats three pf-strip">' +
      statT(ps.streak, 'Day streak', '', 'accent') +
      statT(ps.meals, 'Meals logged', '', '') +
      '<button type="button" class="pf-stat pf-stat-btn" data-action="edit-weight" aria-label="Update weight">' +
        '<span class="pf-stat-pen">' + SET_ICONS.edit + '</span>' +
        '<div class="pf-stat-v">' + (imperial ? Math.round(kgToLb(p.weightKg)) : p.weightKg) + ' <small>' + (imperial ? 'lb' : 'kg') + '</small></div>' +
        '<div class="pf-stat-l">Weight</div></button>' +
    '</div>';
    var signedIn = !!sync.user;
    html += '<button type="button" class="pf-account" data-action="' + (signedIn ? 'open-account' : 'open-sign-in') + '">' +
      '<span class="pf-account-ic">' + SI_ICONS.cloud + '</span>' +
      '<span class="pf-account-tx">' + (signedIn
        ? '<b>' + esc(sync.user.email || sync.user.displayName || 'Signed in') + '</b><small id="accountStatus">' + esc(syncStatusText()) + '</small>'
        : '<b>Back up your log</b><small>Sign in to keep it safe and use it on any phone</small>') + '</span>' +
      '<svg class="pf-account-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' +
    '</button>';
    html += '<h3 class="section-label">Settings</h3>';

    // ---- my plan: units, body details + calculator, and the daily goals
    var unitRow = '<div class="settings-row"><div><div class="sr-label">Units</div><div class="sr-sub">For height and bodyweight below</div></div>' +
      '<div class="seg">' +
        '<button data-action="set-unit" data-unit="metric" class="' + (s.unit === 'metric' ? 'active' : '') + '">METRIC</button>' +
        '<button data-action="set-unit" data-unit="imperial" class="' + (s.unit === 'imperial' ? 'active' : '') + '">IMPERIAL</button>' +
      '</div></div>';
    var planBody = '<div class="settings-group">' + unitRow + '</div>';
    if (STORE.lastPlanTdee){
      planBody += '<div class="plan-result-banner">Estimated maintenance (TDEE): <b>' + STORE.lastPlanTdee + ' kcal/day</b> \u2014 your goals were calculated from this.</div>';
    }
    planBody += profileFormHtml();
    planBody += '<div class="settings-section"><div class="plan-h">Daily goals</div><div class="card">' +
      settingsGoalRow('Calories (kcal)', 'goalCalories', g.calories) +
      settingsGoalRow('Protein (g)', 'goalProtein', g.protein) +
      settingsGoalRow('Carbs (g)', 'goalCarbs', g.carbs) +
      settingsGoalRow('Fat (g)', 'goalFat', g.fat) +
      settingsGoalRow('Sugar (g)', 'goalSugar', g.sugar) +
      settingsGoalRow('Sodium (mg)', 'goalSodium', g.sodium) +
      settingsGoalRow('Water (ml)', 'goalWater', g.water) +
    '</div></div>';
    planBody += mealSplitBoxHtml();
    html += settingsCardHtml('plan', SET_ICONS.goals, 'My plan',
      Math.round(g.calories) + ' kcal \u00B7 P ' + g.protein + ' \u00B7 C ' + g.carbs + ' \u00B7 F ' + g.fat, planBody);

    // ---- look & feel
    var lookBody = '<div class="settings-group">' +
      '<div class="theme-pick">' +
        '<button type="button" data-action="set-theme" data-theme="dark" class="theme-opt dark' + (s.theme !== 'light' ? ' active' : '') + '"><span class="theme-prev"><i></i><i></i></span><b>Dark</b></button>' +
        '<button type="button" data-action="set-theme" data-theme="light" class="theme-opt light' + (s.theme === 'light' ? ' active' : '') + '"><span class="theme-prev"><i></i><i></i></span><b>Light</b></button>' +
      '</div>' +
      (s.theme === 'light' ? '<div class="settings-row light-style"><div><div class="sr-label">Light style</div></div><div class="seg">' +
        [['warm','Warm'],['clean','Clean'],['mint','Mint']].map(function(o){ return '<button data-action="set-light-style" data-val="' + o[0] + '" class="' + (document.body.dataset.light === o[0] ? 'active' : '') + '">' + o[1] + '</button>'; }).join('') +
      '</div></div>' : '') +
      (s.theme !== 'light' ? '<div class="settings-row dark-style"><div><div class="sr-label">Dark style</div></div><div class="seg">' +
        [['classic','Classic'],['glow','Glow']].map(function(o){ return '<button data-action="set-dark-style" data-val="' + o[0] + '" class="' + ((s.darkStyle === 'glow' ? 'glow' : 'classic') === o[0] ? 'active' : '') + '">' + o[1] + '</button>'; }).join('') +
      '</div></div>' : '') +
      '<div class="settings-row"><div><div class="sr-label">Haptic feedback</div><div class="sr-sub">Short vibration when you log a meal</div></div>' +
        '<div class="seg">' +
          '<button data-action="toggle-haptic" data-val="on" class="' + (s.haptic !== false ? 'active' : '') + '">ON</button>' +
          '<button data-action="toggle-haptic" data-val="off" class="' + (s.haptic === false ? 'active' : '') + '">OFF</button>' +
        '</div></div>' +
    '</div>';
    html += settingsCardHtml('look', SET_ICONS.look, 'Look &amp; feel',
      (s.theme === 'light' ? 'Light' + (document.body.dataset.light && document.body.dataset.light !== 'warm' ? ' \u00B7 ' + document.body.dataset.light.charAt(0).toUpperCase() + document.body.dataset.light.slice(1) : '') : 'Dark' + (s.darkStyle === 'glow' ? ' \u00B7 Glow' : '')) + ' \u00B7 Haptics ' + (s.haptic === false ? 'off' : 'on'), lookBody);

    // ---- install (only when the browser can install it)
    if (canOfferInstall()){
      html += '<div class="setc-wrap install"><div class="setc" role="button" tabindex="0" data-action="install-app">' +
        '<span class="setc-ic solid">' + SET_ICONS.install + '</span>' +
        '<span class="setc-tx"><span class="setc-t">Install app</span><span class="setc-d">' + (deferredInstall ? 'Add SaviorFuel to your home screen' : 'Add it to your home screen from Safari') + '</span></span>' +
        '<span class="hist-chev go">' + CHEV_SVG + '</span></div></div>';
    }

    // ---- your data
    var nFoods = (STORE.savedFoods || []).length;
    var dataBody = '<div class="settings-group">' +
      '<div class="settings-row"><div><div class="sr-label">Export backup</div><div class="sr-sub">Download a JSON file of your log</div></div>' +
        '<button class="sr-action" data-action="export-data">Export</button></div>' +
      '<div class="settings-row"><div><div class="sr-label">Import backup</div><div class="sr-sub">Restore from a JSON file</div></div>' +
        '<button class="sr-action" data-action="import-data">Import</button></div>' +
      (function(){
        var bl = readBackups();
        var r = '<div class="settings-row"><div><div class="sr-label">Safety copies</div><div class="sr-sub">' +
          (bl.length ? bl.length + ' saved on this phone \u00B7 latest ' + esc(backupWhen(bl[0].ts)) : 'None yet \u2014 one is saved each day') +
          '</div></div>' +
          (bl.length ? '<button class="sr-action" data-action="toggle-backups">' + (ui.backupsOpen ? 'Hide' : 'View') + '</button>' : '') + '</div>';
        if (ui.backupsOpen) bl.forEach(function(b, i){
          r += '<div class="settings-row bk-row"><div><div class="sr-label">' + esc(backupWhen(b.ts)) + '</div><div class="sr-sub">' + (b.meals || []).length + ' meal' + ((b.meals || []).length === 1 ? '' : 's') + ' \u00B7 ' + esc(b.reason === 'daily' ? 'daily copy' : b.reason) + '</div></div>' +
            '<button class="sr-action" data-action="restore-backup" data-i="' + i + '">Restore</button></div>';
        });
        return r;
      })() +
    '</div>';
    html += settingsCardHtml('data', SET_ICONS.data, 'Your data',
      STORE.meals.length + ' meal' + (STORE.meals.length === 1 ? '' : 's') + ' · Export / Import / Safety copies', dataBody);

    // ---- about & support
    var aboutBody = '<div class="settings-group">' +
      '<div class="settings-row"><div><div class="sr-label">Food data</div>' +
        '<div class="sr-sub">USDA FoodData Central · Open Food Facts (photos CC BY-SA) · ' + nFoods + ' food' + (nFoods === 1 ? '' : 's') + ' saved for offline search</div></div></div>' +
      '<div class="settings-row"><div><div class="sr-label">About SaviorFuel</div>' +
        '<div class="sr-sub">© 2026 Xavier Chua (Savior). All rights reserved. The app\'s code and design may not be copied or reused.</div></div></div>' +
      '<div class="settings-row"><div><div class="sr-label">Share SaviorFuel</div><div class="sr-sub">Send the app to a friend</div></div>' +
        '<button class="sr-action" data-action="share-app">Share</button></div>' +
      '<div class="settings-row"><div><div class="sr-label">Privacy policy</div><div class="sr-sub">What\'s stored, and what leaves your device</div></div>' +
        '<a class="sr-action" href="privacy.html" target="_blank" rel="noopener">Read</a></div>' +
      '<div class="settings-row"><div><div class="sr-label">Instagram</div><div class="sr-sub">@im.savior_</div></div>' +
        '<a class="sr-action" href="https://instagram.com/im.savior_" target="_blank" rel="noopener">Open</a></div>' +
      '<div class="settings-row"><div><div class="sr-label">Email</div><div class="sr-sub">xavierchua10@gmail.com</div></div>' +
        '<a class="sr-action" href="mailto:xavierchua10@gmail.com">Email</a></div>' +
    '</div>';
    html += settingsCardHtml('about', SET_ICONS.info, 'Help &amp; about', 'Sources \u00B7 Privacy \u00B7 Share \u00B7 Email', aboutBody);

    html += '<div class="settings-version">SaviorFuel v' + APP_VERSION + '</div>';

    var dzOpen = !!ui.dangerZoneOpen;
    html += '<div class="section-label danger-zone-toggle' + (dzOpen ? ' open' : '') + '" data-action="toggle-danger-zone">' +
              '<span>Danger zone</span><span class="dz-chevron">&#9660;</span>' +
            '</div>';
    if (dzOpen){
      html += '<button class="btn-danger" data-action="clear-data">Erase all data</button>';
    }

    html += '<input type="file" id="importFile" accept="application/json" style="display:none;">';

    document.getElementById('view').innerHTML = html;
    var importInput = document.getElementById('importFile');
    if (importInput) importInput.addEventListener('change', handleImportFile);
  }

  /* =========================================================
     RENDER DISPATCH
     ========================================================= */
  /* =========================================================
     APP SETTINGS — density/corners (Appearance) applied as body
     data-attributes so the CSS overrides near the top of the file
     pick them up; haptic feedback fires directly where relevant
     (see addMealFromForm). Export/import is a straight JSON
     dump/restore of the whole STORE object.
     ========================================================= */
  function applyAppearanceSettings(){
    document.body.dataset.density = 'comfortable';
    document.body.dataset.corners = STORE.appSettings.corners || 'rounded';
    document.body.dataset.theme = STORE.appSettings.theme || 'dark';
    var ls = STORE.appSettings.lightStyle;
    document.body.dataset.light = (ls === 'clean' || ls === 'mint') ? ls : 'warm';
    document.body.dataset.dark = STORE.appSettings.darkStyle === 'glow' ? 'glow' : 'classic';
    try{ var tc=document.querySelector('meta[name="theme-color"]'); if(tc) tc.setAttribute('content', document.body.dataset.theme==='light' ? ({warm:'#ebe6da',clean:'#f4f5f7',mint:'#eaf4e6'})[document.body.dataset.light] : (document.body.dataset.dark==='glow' ? '#09100c' : '#1f232b')); }catch(e){}
    document.body.dataset.bgArt = STORE.appSettings.bgArt === false ? 'off' : 'on';
  }

  function maybeVibrate(){
    if (STORE.appSettings.haptic === false) return;
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function exportData(){
    var blob = new Blob([JSON.stringify(STORE, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'saviorfuel-backup-' + todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e){
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.meals)) throw new Error('Not a valid SaviorFuel backup file');
        if (!window.confirm('Replace everything currently on this device with this backup?')) return;
        makeSafetyCopy('before import');
        STORE = {
          meals: parsed.meals.map(sanitizeMeal).filter(Boolean),
          goals: Object.assign({}, DEFAULT_GOALS, parsed.goals || {}),
          profile: parsed.profile || Object.assign({}, DEFAULT_PROFILE),
          appSettings: Object.assign({}, DEFAULT_APP_SETTINGS, parsed.appSettings || {}),
          savedFoods: Array.isArray(parsed.savedFoods) ? parsed.savedFoods : [],
          myFoods: Array.isArray(parsed.myFoods) ? parsed.myFoods : [],
          water: (parsed.water && typeof parsed.water === 'object') ? parsed.water : {},
          photos: {},
          weights: cleanWeights(parsed.weights)
        };
        if (parsed.goalsWeightKg > 0) STORE.goalsWeightKg = Number(parsed.goalsWeightKg);
        STORE.photos = cleanPhotos(parsed.photos, STORE.meals);
        saveStore();
        applyAppearanceSettings();
        renderApp();
      } catch (err){
        console.error('SaviorFuel: import failed —', err);
        alert('That file doesn\'t look like a valid SaviorFuel backup.');
      }
    };
    reader.readAsText(file);
  }

  /* ---- Safety copies: a few snapshots (no photos) kept on this phone.
     One is made automatically once a day, and another right before an
     import or an erase. Restoring only adds back what's missing — it
     never deletes anything you have now. ---- */
  var BACKUP_KEY = 'saviorfuel_backups_v1', BACKUP_MAX = 5;
  function readBackups(){
    try { var a = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e){ return []; }
  }
  function writeBackups(list){
    list = list.slice(0, BACKUP_MAX);
    while (list.length){
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list)); return true; }
      catch (e){ list.pop(); }          // storage full: drop the oldest and try again
    }
    try { localStorage.removeItem(BACKUP_KEY); } catch (e2){}
    return false;
  }
  function makeSafetyCopy(reason){
    try {
      if (!STORE.meals.length && !(STORE.savedFoods || []).length && !(STORE.myFoods || []).length) return;
      var list = readBackups();
      if (reason === 'daily' && list[0] && list[0].reason === 'daily' && dateKey(list[0].ts) === todayKey()) return;
      list.unshift(JSON.parse(JSON.stringify({
        ts: Date.now(), reason: reason, meals: STORE.meals, goals: STORE.goals, profile: STORE.profile,
        savedFoods: STORE.savedFoods || [], myFoods: STORE.myFoods || [], water: STORE.water || {}
      })));
      writeBackups(list);
    } catch (e){ console.error('SaviorFuel: safety copy failed —', e); }
  }
  function backupWhen(ts){
    return formatDateLabel(dateKey(ts)) + ' · ' + new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function restoreSafetyCopy(i){
    var b = readBackups()[i];
    if (!b) return;
    if (!window.confirm('Add back anything missing from this copy (' + backupWhen(b.ts) + ')? Nothing you have now is deleted.')) return;
    makeSafetyCopy('before restore');
    var have = {}; STORE.meals.forEach(function(m){ have[m.id] = 1; });
    var added = 0;
    (b.meals || []).map(sanitizeMeal).filter(Boolean).forEach(function(m){ if (!have[m.id]){ STORE.meals.push(m); added++; } });
    function fk(f){ return String((f && (f.code || f.id || f.name)) || JSON.stringify(f)).toLowerCase(); }
    ['savedFoods', 'myFoods'].forEach(function(k){
      var cur = STORE[k] = Array.isArray(STORE[k]) ? STORE[k] : [], seen = {};
      cur.forEach(function(f){ seen[fk(f)] = 1; });
      (b[k] || []).forEach(function(f){ if (!seen[fk(f)]){ cur.push(f); seen[fk(f)] = 1; } });
    });
    STORE.water = STORE.water || {};
    Object.keys(b.water || {}).forEach(function(d){ if (STORE.water[d] == null) STORE.water[d] = b.water[d]; });
    saveStore();
    renderApp();
    showToast(added ? 'Restored ' + added + ' meal' + (added === 1 ? '' : 's') : 'Nothing missing — all of it is already here');
  }

  function shareApp(){
    var url = location.origin + location.pathname.replace(/index\.html$/, '');
    var data = { title: 'SaviorFuel', text: 'SaviorFuel — a free food tracker by Savior.', url: url };
    if (navigator.share){ navigator.share(data).catch(function(){}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){ showToast('Link copied'); }, function(){ showToast(url); });
    } else showToast(url);
  }

