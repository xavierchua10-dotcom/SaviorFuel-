# SaviorFuel

Free food and macro tracker by Savior. Log meals, hit your daily goals, see where your calories come from. Companion to [SaviorFit Logger](https://github.com/xavierchua10-dotcom/IronLedger).

Plain HTML, CSS and JavaScript (no build step), installable as a PWA. No account, no backend: your log lives on your device.

## Features

- **Log** meals by type, edit or delete them, and log for any day
- **Food search** across Open Food Facts (packaged foods and barcodes) and USDA FoodData Central (generic and whole foods, through the SaviorFuel Cloudflare Worker so the key stays private), plus your own saved foods
- **Scan** a barcode or snap a photo of a meal; the photo guess runs on-device with TensorFlow.js (MobileNet)
- **History** of past days
- **Insights** with a 3D food pyramid (or plain rings and macro bars), 7-day calories, daily average vs goal, calories by meal and macro source
- **Settings** for profile, daily goals (calories, protein, carbs, fat, fiber, sugar, sodium), units, theme, density, corners, background image and haptics
- **Backup**: export and import your log as a JSON file
- Works offline once installed (app shell is cached; food search and 3D need internet)

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `style.css` | The page shell and styles |
| `js/app/*.js` | The app code, 20 plain scripts that share one scope and load in order (state, log, food search, scanner, AI scan, history, insights, settings, sync, sign-in, startup) |
| `tools/bump.py` | Release bump: `python3 tools/bump.py N` sets the version on every script and the service worker cache |
| `sw.js`, `manifest.json`, `icons/` | PWA service worker, manifest and icons |
| `models/` | GLB models for the Insights tab |
| `images/` | Background and guide illustrations |
| `ai-proxy/` | Optional proxy for a Gemini photo scan (Cloudflare Worker or Netlify). Built and tested, not switched on yet: `AI_SCAN_URL` in `js/app/09-ai-scan.js` is empty. See [`ai-proxy/README.md`](ai-proxy/README.md) |

## Run it

Serve the folder with any static host (GitHub Pages, Netlify) or locally, for example `python3 -m http.server`. A service worker needs `https` or `localhost`.

## Roadmap

- Play Store listing
- Offline food library (copies of USDA and Open Food Facts data)
- Gemini AI food scan via the proxy

## License

Copyright (c) 2026 Xavier Chua (Savior). **All rights reserved.**

The source is public so it can be read, but it is not open source: you may not
copy, reuse, modify, host or redistribute it, or use it to build a similar app,
without written permission. Third-party libraries and data keep their own licenses.
See [LICENSE](LICENSE) for the full terms.
