// Run with: node scan-core.test.mjs   (no dependencies needed)
import assert from 'node:assert/strict';
import { handleScan, cleanItems } from './lib/scan-core.mjs';

const ORIGIN = 'https://xavierchua10-dotcom.github.io';
const IMG = 'A'.repeat(400); // valid base64 characters, long enough to pass the size floor
const memStore = () => { const m = new Map(); return { async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; }, async setJSON(k, v) { m.set(k, JSON.stringify(v)); }, _m: m }; };
const geminiReply = (obj) => async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] }), { status: 200 });
const post = (body, headers = {}) => new Request('https://x.test/api/scan-food', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: JSON.stringify(body) });
const env = { GEMINI_API_KEY: 'test-key' };
const good = { image: IMG, mime: 'image/jpeg' };
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('ok  ', name); };

await t('preflight from the app origin is allowed', async () => {
  const r = await handleScan(new Request('https://x.test', { method: 'OPTIONS', headers: { origin: ORIGIN } }), { store: memStore(), env });
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
});
await t('preflight from another site is refused', async () => {
  const r = await handleScan(new Request('https://x.test', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), { store: memStore(), env });
  assert.equal(r.status, 403); assert.equal(r.headers.get('access-control-allow-origin'), null);
});
await t('POST from another site, or with no origin, is refused (and never reaches Gemini)', async () => {
  let called = 0; const f = async () => { called++; return geminiReply({ items: [] })(); };
  for (const h of [{ origin: 'https://evil.example' }, { origin: '' }]) {
    const req = new Request('https://x.test', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(good) });
    const r = await handleScan(req, { store: memStore(), env, fetchImpl: f }); assert.equal(r.status, 403);
  }
  assert.equal(called, 0);
});
await t('GET is 405', async () => {
  const r = await handleScan(new Request('https://x.test', { method: 'GET', headers: { origin: ORIGIN } }), { store: memStore(), env }); assert.equal(r.status, 405);
});
await t('missing API key gives a clear "not set up" error, not a crash', async () => {
  const r = await handleScan(post(good), { store: memStore(), env: {} }); assert.equal(r.status, 500); assert.equal((await r.json()).code, 'not_configured');
});
await t('bad bodies are rejected: not JSON, wrong mime, not base64, too big', async () => {
  const s = memStore();
  const notJson = new Request('https://x.test', { method: 'POST', headers: { origin: ORIGIN }, body: 'nope' });
  assert.equal((await handleScan(notJson, { store: s, env })).status, 400);
  assert.equal((await handleScan(post({ image: IMG, mime: 'application/pdf' }), { store: s, env })).status, 400);
  assert.equal((await handleScan(post({ image: 'not base64!!' + 'A'.repeat(200), mime: 'image/jpeg' }), { store: s, env })).status, 400);
  assert.equal((await handleScan(post({ image: 'A'.repeat(1_700_000), mime: 'image/jpeg' }), { store: s, env })).status, 413);
});
await t('happy path: cleaned items come back with CORS header and no-store', async () => {
  const f = geminiReply({ items: [{ name: 'Nasi lemak', grams: 320, calories: 640, protein_g: 18, carbs_g: 80, fat_g: 26, fiber_g: 4, sugar_g: 6, sodium_mg: 1100, confidence: 0.8 }], note: 'Looks like nasi lemak.' });
  const r = await handleScan(post(good), { store: memStore(), env, fetchImpl: f });
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN); assert.equal(r.headers.get('cache-control'), 'no-store');
  const d = await r.json(); assert.equal(d.items.length, 1); assert.equal(d.items[0].name, 'Nasi lemak'); assert.equal(d.items[0].calories, 640); assert.equal(d.note, 'Looks like nasi lemak.'); assert.equal(d.remainingToday, 24);
});
await t('the request to Gemini carries the key in a header (not the URL) and the photo', async () => {
  let seen; const f = async (url, init) => { seen = { url, init }; return geminiReply({ items: [] })(); };
  await handleScan(post(good), { store: memStore(), env, fetchImpl: f });
  assert.ok(!seen.url.includes('test-key')); assert.equal(seen.init.headers['x-goog-api-key'], 'test-key');
  const sent = JSON.parse(seen.init.body); assert.equal(sent.contents[0].parts[0].inlineData.data, IMG); assert.equal(sent.generationConfig.responseMimeType, 'application/json');
});
await t('per-person daily limit stops at the cap; other people are unaffected', async () => {
  const s = memStore(); const e = { ...env, PER_IP_DAILY: '3' }; const f = geminiReply({ items: [] });
  for (let i = 0; i < 3; i++) assert.equal((await handleScan(post(good), { ip: '1.2.3.4', store: s, env: e, fetchImpl: f })).status, 200);
  const r = await handleScan(post(good), { ip: '1.2.3.4', store: s, env: e, fetchImpl: f }); assert.equal(r.status, 429); assert.equal((await r.json()).code, 'ip_limit');
  assert.equal((await handleScan(post(good), { ip: '9.9.9.9', store: s, env: e, fetchImpl: f })).status, 200); // someone else is unaffected
});
await t('global daily cap stops everyone', async () => {
  const s = memStore(); const e = { ...env, DAILY_CAP: '2' }; const f = geminiReply({ items: [] });
  await handleScan(post(good), { ip: 'a', store: s, env: e, fetchImpl: f }); await handleScan(post(good), { ip: 'b', store: s, env: e, fetchImpl: f });
  const r = await handleScan(post(good), { ip: 'c', store: s, env: e, fetchImpl: f }); assert.equal(r.status, 429); assert.equal((await r.json()).code, 'global_limit');
});
await t('DAILY_CAP=0 skips the everyone-combined counter (one write per scan)', async () => {
  const s = memStore(); const e = { ...env, DAILY_CAP: '0', PER_IP_DAILY: '2' }; const f = geminiReply({ items: [] });
  for (let i = 0; i < 2; i++) assert.equal((await handleScan(post(good), { ip: 'z', store: s, env: e, fetchImpl: f })).status, 200);
  assert.ok([...s._m.keys()].every((k) => k.startsWith('ip:')), 'no all: key written');
  assert.equal((await handleScan(post(good), { ip: 'z', store: s, env: e, fetchImpl: f })).status, 429); // per-person limit still works
});
await t('limits reset on a new day, and IPs are stored hashed', async () => {
  const s = memStore(); const e = { ...env, PER_IP_DAILY: '1' }; const f = geminiReply({ items: [] });
  await handleScan(post(good), { ip: '5.5.5.5', store: s, env: e, fetchImpl: f, now: () => new Date('2026-09-20T10:00:00Z') });
  assert.equal((await handleScan(post(good), { ip: '5.5.5.5', store: s, env: e, fetchImpl: f, now: () => new Date('2026-09-20T23:00:00Z') })).status, 429);
  assert.equal((await handleScan(post(good), { ip: '5.5.5.5', store: s, env: e, fetchImpl: f, now: () => new Date('2026-09-21T00:30:00Z') })).status, 200);
  assert.ok([...s._m.keys()].every((k) => !k.includes('5.5.5.5')));
});
await t('if the limit store is down the scan is refused (fails closed, no unmetered AI calls)', async () => {
  let called = 0; const broken = { async get() { throw new Error('down'); }, async setJSON() {} };
  const r = await handleScan(post(good), { store: broken, env, fetchImpl: async () => { called++; return geminiReply({ items: [] })(); } });
  assert.equal(r.status, 503); assert.equal(called, 0);
});
await t('Gemini errors become friendly errors: 500 -> 502, 429 -> 503 "busy", garbage -> 502', async () => {
  const s = () => memStore();
  assert.equal((await handleScan(post(good), { store: s(), env, fetchImpl: async () => new Response('x', { status: 500 }) })).status, 502);
  const busy = await handleScan(post(good), { store: s(), env, fetchImpl: async () => new Response('x', { status: 429 }) }); assert.equal(busy.status, 503); assert.equal((await busy.json()).code, 'upstream_busy');
  assert.equal((await handleScan(post(good), { store: s(), env, fetchImpl: geminiReply('this is not json') })).status, 502);
  assert.equal((await handleScan(post(good), { store: s(), env, fetchImpl: async () => { throw Object.assign(new Error('t'), { name: 'AbortError' }); } })).status, 502);
});
await t('answers wrapped in ```json fences still parse', async () => {
  const r = await handleScan(post(good), { store: memStore(), env, fetchImpl: geminiReply('```json\n{"items":[{"name":"Apple","grams":180,"calories":95,"protein_g":0.5,"carbs_g":25,"fat_g":0.3}]}\n```') });
  assert.equal((await r.json()).items[0].name, 'Apple');
});
await t('cleanItems: clamps nonsense, strips markup, fixes calories that contradict the macros, caps at 8', async () => {
  const out = cleanItems([
    { name: '<img src=x onerror=alert(1)>Rice', grams: 99999, calories: 1, protein_g: 5, carbs_g: 60, fat_g: 1, sodium_mg: -5 },
    { name: '   ', grams: 100 }, { name: 'Zero', grams: 0 }, null, 'str', { name: 'Bad numbers', grams: 'abc' },
    ...Array.from({ length: 12 }, (_, i) => ({ name: 'Item ' + i, grams: 50, calories: 100, protein_g: 5, carbs_g: 10, fat_g: 4 }))
  ]);
  assert.ok(out.length <= 8);
  assert.ok(!out[0].name.includes('<') && out[0].name.includes('Rice'));
  assert.equal(out[0].grams, 2000); assert.equal(out[0].sodium_mg, 0);
  assert.equal(out[0].calories, Math.round(4 * 5 + 4 * 60 + 9 * 1)); // 1 kcal contradicted the macros, so macros win
  assert.equal(cleanItems('nope').length, 0);
});
console.log(`\n${passed} checks passed`);
