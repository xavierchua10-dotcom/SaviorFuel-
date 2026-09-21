// SaviorFuel AI proxy — Copyright (c) 2026 Xavier Chua (Savior). All rights reserved. See the LICENSE file in the repo root.
// Cloudflare Workers version of the AI scan proxy. Same logic as the Netlify
// version (lib/scan-core.mjs) — only the wiring differs: the person's address
// comes from Cloudflare's header, and the daily counters live in a Workers KV
// namespace bound to this Worker as SCAN_LIMITS.
//
// Don't edit worker.js by hand — it's this file bundled together with the
// core (run `npm run build:worker`). Paste worker.js into the Cloudflare editor.
import { handleScan } from '../lib/scan-core.mjs';

export default {
  async fetch(req, env) {
    const kv = env.SCAN_LIMITS;
    if (!kv) {
      return new Response(JSON.stringify({ error: 'The scanner is not set up yet.', code: 'not_configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }
    const store = {
      get: (key) => kv.get(key, 'json'),
      // counters expire by themselves after two days, so nothing piles up
      setJSON: (key, value) => kv.put(key, JSON.stringify(value), { expirationTtl: 60 * 60 * 48 })
    };
    return handleScan(req, { ip: req.headers.get('CF-Connecting-IP') || 'unknown', store, env });
  }
};
