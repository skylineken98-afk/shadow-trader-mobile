# Shadow Trader Mobile — public beta frontend

Installable phone-first PWA for **options, stocks and crypto**. This is a complete **static frontend** that deploys without a build command and has local-only watchlist, simulated trading journal and research notes, plus JSON research-signal import. All quotes and broker trading are deliberately **not connected**.

## Cloudflare Pages (free tier)

Upload the **contents of this folder** into `skylineken98-afk/shadow-trader-mobile` on GitHub (not a ZIP; not an extra nested directory). In Cloudflare use **Pages**, connect that GitHub repo, choose **no framework**, set **build command empty** and **output directory `.`**. Do not use the existing Python repository as a Cloudflare Workers app or run `npx wrangler deploy` on it. A plain static Pages project suffices here.

Alternatively deploy **this folder** directly to Cloudflare Pages using Direct Upload for an initial beta preview.

## Backend reality

- Original V1 ranking formula: preserved in the separate backend archive included in the outer bundle. This frontend does not independently calculate option chains.
- AI Brain/continuous learning, remote scheduled paper agents, Robinhood, Crypto.com, Alpaca live data: **not operational through this static frontend**. They need deployed authenticated backend services, secure API keys, permissions, endpoint configuration, data retention and appropriate testing.
- No secrets belong in the public repo. No live order capabilities exist in this release.
- Local paper records live in browser localStorage: clearing site data removes them. Export your simulated trades using the button.
- The V1 ranking is quality, not win probability. No current prices are shown.

Keep the existing Python V3 repository independently deployed; **do not upload the Python backend archive to your public mobile GitHub repo**. It may contain deployment configuration that must be reviewed for secrets, even though none are intentionally included here.
