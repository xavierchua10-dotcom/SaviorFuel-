# SaviorFuel AI food scan — proxy

The app can't hold a Gemini API key itself (the repo and the site are public,
so anyone could copy it). This tiny server holds the key instead:

```
phone (SaviorFuel) --photo--> this proxy --photo--> Google Gemini
                   <--foods--            <--answer--
```

It also protects the wallet: only the app's own site may call it, each person
gets a daily scan allowance, and there's a daily cap for everyone. All the logic
is in `lib/scan-core.mjs` (tested by `npm test`).

## Where to run it (both free)

**Option A — Cloudflare Workers (recommended).** Free plan: 100,000 requests a day,
no credit card, and it simply stops when you hit the limit instead of billing you.
Free-plan Workers get 10 ms of CPU per request; a scan spends almost all its time
waiting on Google (not counted), so it should fit — but it's untested on Cloudflare.

1. **Get a Gemini key** at <https://aistudio.google.com/apikey> (never paste it into the repo, the app, or a chat).
2. Sign up at <https://dash.cloudflare.com> (free). **Workers & Pages → Create → Create Worker**,
   name it (e.g. `saviorfuel-ai`), **Deploy**, then **Edit code**, delete the sample, paste the whole of
   [`cloudflare/worker.js`](cloudflare/worker.js), and **Deploy** again.
3. **Storage & Databases → KV → Create a namespace** (name: `scan-limits`).
4. Back in the Worker: **Settings → Bindings → Add → KV namespace**. Variable name must be exactly
   `SCAN_LIMITS`; pick the namespace you just made.
5. **Settings → Variables and Secrets** — add:

   | Name | Type | Value |
   |---|---|---|
   | `GEMINI_API_KEY` | **Secret** | your key (**required**) |
   | `ALLOWED_ORIGINS` | Text | the app's address, e.g. `https://xavierchua10-dotcom.github.io` |
   | `DAILY_CAP` | Text | `0` (skips the everyone-combined counter — KV's free plan only allows ~1,000 writes a day) |
   | `PER_IP_DAILY` | Text | scans per person per day (default `25`) |

6. Your address is `https://<worker-name>.<your-subdomain>.workers.dev`. Set `AI_SCAN_URL` in `index.html`
   to it and push. Until then the camera button keeps using the basic on-device guess.

(`worker.js` is generated: edit `cloudflare/worker.src.mjs` or `lib/scan-core.mjs`, then `npm run build:worker`.)

**Option B — Netlify.** Free plan is 300 credits a month, and everything draws from it
(each production deploy costs 15 credits, plus bandwidth and function time). The scans themselves
are cheap, but deploys add up — `netlify.toml` here skips builds unless something inside `ai-proxy/` changed.
If credits run out the site can stop working until the month resets.

1. Get a Gemini key (as above).
2. **Netlify → Add new site → Import from Git** → the `SaviorFuel-` repo, **Base directory** `ai-proxy`.
3. **Site configuration → Environment variables**: `GEMINI_API_KEY` (required), and optionally
   `ALLOWED_ORIGINS`, `PER_IP_DAILY`, `DAILY_CAP`, `GEMINI_MODEL`. Then trigger a new deploy.
4. Your address is `https://<your-site>.netlify.app/api/scan-food`. Set `AI_SCAN_URL` to it.

Optional settings (either host): `DAILY_CAP` (scans for everyone per day, default `1500`, `0` = off),
`GEMINI_MODEL` (default `gemini-2.5-flash-lite`; check Google's current list), `IP_SALT`.

## Before you go public — read this

- **Set a spending limit.** On the free Gemini tier there's nothing to overspend,
  but Google may use free-tier content to improve its products, and rate limits are low.
  On a paid key, set a budget alert/cap in Google Cloud — `DAILY_CAP` is a second line of defence.
- The scan tells users their photo goes to Google's Gemini (a one-time prompt in the app).
  This proxy never stores photos; it only keeps per-day counters, with IPs hashed.
- Counter records are tiny. On Cloudflare they expire by themselves after two days; on Netlify they
  pile up one per active person per day, so clear the `scan-limits` store (Blobs) now and then.
- Portion sizes from a photo are estimates. The app makes people confirm and edit them.
