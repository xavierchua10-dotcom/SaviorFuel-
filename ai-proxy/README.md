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

## Set it up (about 10 minutes, all doable from a phone)

1. **Get a Gemini API key** at <https://aistudio.google.com/apikey>.
   Keep it private — never paste it into the repo, the app, or a chat.
2. **Netlify → Add new site → Import from Git** → pick the `SaviorFuel-` repo.
   Set **Base directory** to `ai-proxy`. (Build settings come from `netlify.toml`.)
3. **Site configuration → Environment variables**, add:

   | Name | Value |
   |---|---|
   | `GEMINI_API_KEY` | your key (**required**) |
   | `ALLOWED_ORIGINS` | the app's address, e.g. `https://xavierchua10-dotcom.github.io` (comma-separate several). Defaults to that one. |
   | `PER_IP_DAILY` | scans per person per day (default `25`) |
   | `DAILY_CAP` | scans for everyone per day (default `1500`) |
   | `GEMINI_MODEL` | model name (default `gemini-2.5-flash-lite`; check Google's current list) |

4. **Deploy.** Your endpoint is `https://<your-site>.netlify.app/api/scan-food`.
5. In `index.html`, set `AI_SCAN_URL` to that address and push. Until it's set, the
   camera button keeps using the basic on-device guess.

## Before you go public — read this

- **Set a spending limit.** On the free Gemini tier there's nothing to overspend,
  but Google may use free-tier content to improve its products, and rate limits are low.
  On a paid key, set a budget alert/cap in Google Cloud — `DAILY_CAP` is a second line of defence.
- The scan tells users their photo goes to Google's Gemini (a one-time prompt in the app).
  This proxy never stores photos; it only keeps per-day counters, with IPs hashed.
- Counter records are tiny and pile up one per active person per day; clear the
  `scan-limits` store in Netlify (Blobs) now and then.
- Portion sizes from a photo are estimates. The app makes people confirm and edit them.
