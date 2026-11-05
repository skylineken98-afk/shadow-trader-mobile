# KST mobile r5

The mobile app now includes chart chat, earnings, ticker news, public stock setups, private contract ideas and positions, and account/membership controls.

This upgrades the old static-only Pages preview to a Cloudflare Worker with server-only API access. The Worker uses wrangler.jsonc and serves public/. Root HTML/JS/CSS copies are kept in sync for the existing static preview, but static hosting alone does not provide the API.

Do not deploy before the backend schema and services are configured and verified. Add SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY, PUBLIC_SIGNALS_ENABLED=true when intentionally publishing research, and the chat proxy URL/secret and optional push key. Never put secrets in public/ or root browser files.

Use the existing Cloudflare project settings to determine whether to migrate from Pages to Workers. This repository update alone does not change that hosting configuration.

Development checks: npm ci && npm test. Optional real browser smoke: npx playwright install chromium && npm run test:browser. All API data in interaction tests is synthetic.

Read RELEASE_R5.md for the full activation steps and verification limits. Billing enforcement and live execution remain disabled.
