// Run with: node cloudflare/worker.test.mjs
import assert from 'node:assert/strict';
import worker from './worker.src.mjs';

const ORIGIN = 'https://xavierchua10-dotcom.github.io';
const fakeKV = () => { const m = new Map(); const puts = []; return { async get(k, type) { assert.equal(type, 'json'); return m.has(k) ? JSON.parse(m.get(k)) : null; }, async put(k, v, opts) { puts.push({ k, opts }); m.set(k, v); }, _m: m, _puts: puts }; };
const post = (ip) => new Request('https://w.test/scan', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'CF-Connecting-IP': ip }, body: JSON.stringify({ image: 'A'.repeat(400), mime: 'image/jpeg' }) });
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ name: 'Rice', grams: 200, calories: 260, protein_g: 5, carbs_g: 56, fat_g: 1 }] }) }] } }] }), { status: 200 });
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok  ', name); };

await t('scan works end to end with the KV binding and Cloudflare\'s client-IP header', async () => {
  const kv = fakeKV(); const env = { GEMINI_API_KEY: 'k', SCAN_LIMITS: kv, DAILY_CAP: '0' };
  const r = await worker.fetch(post('9.9.9.9'), env); assert.equal(r.status, 200);
  const d = await r.json(); assert.equal(d.items[0].name, 'Rice');
  assert.equal(kv._puts.length, 1); assert.ok(kv._puts[0].k.startsWith('ip:')); assert.ok(!kv._puts[0].k.includes('9.9.9.9')); // hashed
  assert.equal(kv._puts[0].opts.expirationTtl, 172800); // counters clean themselves up
});
await t('per-person limit is enforced across requests, per IP', async () => {
  const kv = fakeKV(); const env = { GEMINI_API_KEY: 'k', SCAN_LIMITS: kv, DAILY_CAP: '0', PER_IP_DAILY: '2' };
  assert.equal((await worker.fetch(post('1.1.1.1'), env)).status, 200); assert.equal((await worker.fetch(post('1.1.1.1'), env)).status, 200);
  assert.equal((await worker.fetch(post('1.1.1.1'), env)).status, 429); assert.equal((await worker.fetch(post('2.2.2.2'), env)).status, 200);
});
await t('missing KV binding gives a clear "not set up" error instead of crashing', async () => {
  const r = await worker.fetch(post('3.3.3.3'), { GEMINI_API_KEY: 'k' }); assert.equal(r.status, 500); assert.equal((await r.json()).code, 'not_configured');
});
await t('other sites are still refused', async () => {
  const req = new Request('https://w.test', { method: 'POST', headers: { origin: 'https://evil.example', 'CF-Connecting-IP': '4.4.4.4' }, body: '{}' });
  assert.equal((await worker.fetch(req, { GEMINI_API_KEY: 'k', SCAN_LIMITS: fakeKV() })).status, 403);
});
globalThis.fetch = realFetch;
console.log(`\n${n} checks passed`);
