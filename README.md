# Appurdex

Appurdex tracks AI coding agents with source-backed verification, Overview rankings for companies, build agents, and exact-match LLMs, public language routes, an admin backend surface, and API subscription endpoints.

## Routes

- Public rankings overview: `/?view=companies|agents|llms`
- Legacy agents index redirect: `/agents` redirects to `/?view=agents`
- Vendor overview: `/vendors`
- Public AI product page: `/vendors/:vendorSlug/:agentSlug`, for example `/vendors/openai/openai-codex`
- Use-case browsing: `/use-cases` and `/use-cases/:slug`
- Admin backend: `/admin`
- Admin agent editor: `/admin/:agentSlug`, for example `/admin/cursor`

## Scripts

```bash
npm install
npm run dev
npm run dev:api
npm run build
npm start
npm run worker:sync
```

`npm run dev` starts the Vite frontend on `http://127.0.0.1:5173` and uses `--strictPort`, so it will not silently fall back to `5174`. `npm run dev:api` starts the local Node backend/API on `http://127.0.0.1:8791` and loads `.env.local` automatically. Open the app at `5173`; keep `8791` running only for API/data endpoints.

Production launch requires the Node server process. For the first live split, keep the Vercel frontend static build pointed at `VITE_API_BASE_URL`, and run the Node API/storage service on Render with `npm install && npm run build` plus `npm start`. Static-only hosting is not enough for real login sessions because auth state is stored server-side.

## Data Model

The catalog JSON store is created at `data/appurdex-db.json` by default, or `APPURDEX_CATALOG_DB_PATH` when configured. Customer auth, sessions, billing, subscriber API keys, API usage, and sync scheduling state are stored in SQLite at `data/appurdex-auth.sqlite` by default, or `APPURDEX_DB_PATH` when configured. On Render, set `APPURDEX_DATA_DIR=/opt/render/project/src/data` and mount a persistent disk there so both files survive deploys and restarts.

Each agent keeps:

- `slug`
- official source URLs
- source freshness timestamp
- source-check status
- GitHub metrics when a public repo exists
- provenance and resale policy notes
- vendor-claim eligibility
- `agent_type`, a fixed `build` or `review` ranking axis independent of category sub-tags
- `lifecycle_status`, one of `active`, `legacy`, `deprecated`, or `retired`; this is an agent-directory lifecycle filter and does not replace model-pricing status
- `use_cases`, a stored array of fixed taxonomy slugs separate from `category`

Overview ranks source-backed companies and individual Build Agents. Review Agent records remain stored for directory and admin use but are not ranked in Overview. The LLM view ranks exact model-ID matches only and leaves incomplete records visibly unranked.

## Backend Surfaces

- `/api/public/agents`
- `/api/use-cases?group=coding_specific|general_purpose|all`
- `/api/use-cases/:slug?group=coding_specific|general_purpose|all`
- `/api/admin/state`
- `/api/admin/agents/:slug`
- `/api/admin/review-queue/:id`
- `/api/admin/api-keys`
- `/api/admin/run-worker`
- `/api/auth/me`
- `/api/auth/logout`
- `/api/auth/email/start`
- `/api/auth/email/verify`
- `/api/auth/google/start`
- `/api/auth/google/callback`
- `/api/auth/apple/start`
- `/api/auth/apple/callback`
- `/api/billing/create-checkout-session`
- `/api/billing/create-portal-session`
- `/api/billing/webhook`

## Subscriber API

Subscriber endpoints require `x-appurdex-api-key`. Customer API keys are paid-only for Starter, Pro, Enterprise, and admin accounts; Free accounts can browse public surfaces but cannot create or use customer API keys. Starter includes snapshot, category, source-backed pricing, model-pricing, source-catalog, watchlist, and saved-comparison endpoints. Pro adds historical data, alerts, webhooks, CSV export, and AppurScore. Enterprise adds bulk export and custom commercial volume. Customer keys are counted against the signed-in user monthly API limit and return `429` with `x-appurdex-limit`, `x-appurdex-remaining`, and `x-appurdex-reset` headers when the monthly limit is exhausted.

- `POST /api/search/research`
- `GET /api/v1/agents` for Starter and above
- `GET /api/v1/agents/:slug` for Starter and above
- `GET /api/v1/categories` for Starter and above
- `GET /api/v1/pricing` for Starter and above
- `GET /api/v1/model-pricing` for Starter and above
- `GET /api/v1/source-catalog` for Starter and above
- `GET|POST|DELETE /api/v1/watchlists` for Starter and above
- `GET|POST|DELETE /api/v1/saved-comparisons` for Starter and above
- `GET /api/v1/history/:slug` for Pro and Enterprise
- `GET /api/v1/appurscore/:slug` for Pro and Enterprise
- `GET /api/v1/alerts` for Pro and Enterprise source-change alerts backed by real review/source-check events
- `GET|POST|DELETE /api/v1/webhooks` for Pro and Enterprise HMAC-signed webhook endpoints
- `GET /api/v1/bulk/agents?format=csv` for Enterprise

OpenAPI is in `docs/openapi.json`. The TypeScript client is in `sdk/js`.

Shared use-case taxonomy endpoints are public and return only populated use cases with at least 3 tagged products. The fixed taxonomy contains 26 coding-specific and 27 general-purpose values. docs/use-case-tagging-report.json records the before/after product count for every value after each tagging pass. Appurdex consumes them with `group=all` so its index can render populated coding-specific and general-purpose sections; AppurScope should consume the same shared contract from its separate repo. Unknown tags are rejected on writes/imports rather than inferred at request time.
Internal sync endpoint:

- `/api/cron/hourly-sync`

## Verification Boundary

The worker performs official-source hash checks and objective metadata updates. Licensed source growth uses `npm run licensed:ingest -- <licensed-source.json>` as a dry run and `npm run licensed:ingest -- <licensed-source.json> --apply` to create pending review candidates; it does not publish verified listings by itself. The worker does not do full automated extraction of pricing pages. Changed pages, vendor claims, and user suggestions go into the review queue before public fields are changed. In production, the in-process scheduler defaults to every 30 minutes and runs the tiered budgeted worker. Default tiers are `top` records through 250 every 30 minutes, `high` records through 500 every 1 hour, `mid` records through 1,500 every 6 hours, and `long_tail` records every 24 hours. Configure `APPURDEX_SYNC_TOP_LIMIT`, `APPURDEX_SYNC_HIGH_LIMIT`, `APPURDEX_SYNC_MID_LIMIT`, and `APPURDEX_SYNC_REQUEST_BUDGET` to tune coverage per run. Use `APPURDEX_WORKER_INTERVAL_MS` to override scheduler cadence, or trigger `/api/cron/hourly-sync` from a cloud scheduler using `APPURDEX_CRON_SECRET` or `CRON_SECRET`.
## Required Integration Env

Real auth and billing do not silently fall back to fake success states. Missing provider env vars return explicit 503 responses.

- `SESSION_SECRET`
- `APP_BASE_URL` for the Render API origin
- Vercel `VITE_API_BASE_URL` pointing at the Render API origin
- `RESEND_API_KEY`, `EMAIL_FROM`
- `APPURDEX_DATA_DIR` pointing at the Render persistent disk mount
- `APPURDEX_DB_PATH` pointing at persistent SQLite storage in production
- `APPURDEX_CATALOG_DB_PATH` pointing at persistent catalog JSON storage in production
- `APPURDEX_CRON_SECRET`
- Optional later OAuth: `APPURDEX_ENABLE_GOOGLE_LOGIN=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Optional later Apple login: `APPURDEX_ENABLE_APPLE_LOGIN=true`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
- Required for paid-only API launch: `APPURDEX_ENABLE_BILLING=true`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Optional later billing prices: `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`
- Optional enterprise billing prices: `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_ANNUAL` when Enterprise is sold through Stripe instead of a custom contract
- Optional LLM fallback for natural-language search: `OPENAI_API_KEY`, `APPURDEX_LLM_MODEL`

Admin users are manually granted by setting `users.role = 'admin'` in the SQLite database for the signed-in account. Admin bypasses subscription checks. For first launch, sign in with email magic link, then promote that real user in the persistent SQLite database.
Freshness scores are recomputed server-side every hour by default using `APPURDEX_FRESHNESS_INTERVAL_MS`. API responses include `last_synced_at`, `sync_tier`, `freshness_score`, `sync_age_label`, and `sync_age_tone` for listing recency. These fields describe sync recency, not verification or accuracy, and are a default catalog signal rather than a paid freshness tier. Plan limits default to Free browsing with no customer API quota, Starter `APPURDEX_STARTER_API_MONTHLY_LIMIT=5000`, Pro `APPURDEX_PRO_API_MONTHLY_LIMIT=50000`, and Enterprise custom/unlimited unless `APPURDEX_ENTERPRISE_API_MONTHLY_LIMIT` is set.
