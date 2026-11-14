// SaviorFuel foods proxy — Copyright (c) 2026 Xavier Chua (Savior). All rights reserved.
// Holds the USDA and Kalori (techapi.my) keys so they never sit in the public app.
//
//   phone (SaviorFuel) --"chicken rice"--> this Worker --key--> USDA / Kalori
//                      <--results--                     <--results--
//
// Paste this whole file into a Cloudflare Worker (see ai-proxy/README.md, "Foods proxy").
// No build step, no storage needed. Secrets/variables it reads:
//   USDA_API_KEY     (Secret)  your USDA FoodData Central key
//   TECHAPI_KEY      (Secret)  your techapi.my key
//   ALLOWED_ORIGINS  (Text)    the app's site, e.g. https://xavierchua10-dotcom.github.io

const CACHE_SECONDS = 60 * 60 * 24; // food data rarely changes: cache a day, saves your free quota

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, origin ? corsHeaders(origin) : {})
  });
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    // Only the app's own site may use this. (An empty list means "anyone" — set it!)
    if (allowed.length && !allowed.includes(origin)) return json({ error: 'Not allowed.' }, 403, '');
    const corsOrigin = origin || '*';

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    if (req.method !== 'GET') return json({ error: 'GET only.' }, 405, corsOrigin);

    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (!q) return json({ error: 'Missing q.' }, 400, corsOrigin);

    let upstream, init = {};
    if (url.pathname === '/kalori') {
      if (!env.TECHAPI_KEY) return json({ error: 'Kalori key not set.' }, 500, corsOrigin);
      upstream = 'https://api.techapi.my/api/v2/kalori/foods/search?q=' + encodeURIComponent(q);
      init = { headers: { 'X-API-Key': env.TECHAPI_KEY } };
    } else if (url.pathname === '/usda') {
      if (!env.USDA_API_KEY) return json({ error: 'USDA key not set.' }, 500, corsOrigin);
      upstream = 'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(env.USDA_API_KEY) +
        '&query=' + encodeURIComponent(q) + '&pageSize=10&dataType=Foundation,SR%20Legacy';
    } else {
      return json({ error: 'Unknown route.' }, 404, corsOrigin);
    }

    // Same search twice in a day = served from Cloudflare's cache, no call to USDA/Kalori.
    const cache = caches.default;
    const cacheKey = new Request(url.origin + url.pathname + '?q=' + encodeURIComponent(q.toLowerCase()));
    let hit = await cache.match(cacheKey);
    let text, status = 200;
    if (hit) {
      text = await hit.text();
    } else {
      let res;
      try { res = await fetch(upstream, init); } catch (e) { return json({ error: 'Food service unreachable.' }, 502, corsOrigin); }
      text = await res.text();
      status = res.ok ? 200 : res.status;
      if (res.ok) {
        ctx.waitUntil(cache.put(cacheKey, new Response(text, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + CACHE_SECONDS }
        })));
      }
    }
    return new Response(text, {
      status,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, corsHeaders(corsOrigin))
    });
  }
};
