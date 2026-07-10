# Data Sourcing

Appurdex should grow from reviewed source records, official-source worker checks, vendor claims, and community suggestions. Do not invent rows, metrics, ratings, or API responses.

## Public and Admin Routes

- Public AI product route: `/vendors/:vendorSlug/:agentSlug`
- Vendor overview route: `/vendors`
- Admin backend route: `/admin`
- Admin agent editor: `/admin/:agentSlug`

Example: OpenAI Codex public page is `/vendors/openai/openai-codex`; its admin editor is `/admin/openai-codex`.

## Source Types

1. Official product pages and documentation for proprietary tools.
2. Public GitHub repositories for open-source coding agents.
3. Vendor-submitted claims after proof review.
4. Community suggestions after review.
5. Licensed third-party providers only when resale rights are explicit.


## Licensed Source Ingestion

Use `npm run licensed:ingest -- <licensed-source.json>` to dry-run a licensed catalog feed and `npm run licensed:ingest -- <licensed-source.json> --apply` to create pending review candidates. The input must include `source.name`, `source.licenseName`, and `source.resaleAllowed=true`. Ingestion preserves source license and provenance metadata, but it does not add public verified listings or pricing claims without admin review.

## Worker Policy

The Appurdex worker may automatically update objective, source-backed fields:

- GitHub stars, forks, issue count, license, and last push date.
- Official source page HTTP status.
- Official source content hash.
- Last checked date.
- Changed-source flags.

The worker should not fully extract and republish pricing-page contents as verified fields. Pricing/source page changes should create review queue items unless a later extraction rule is explicitly approved and legally reviewed.

## Review Queue

Review items are created for:

- changed official source hash
- failed source checks
- vendor claims
- community suggestions

Admin actions can approve, reject, or leave items pending. Public pages should mark unreviewed claims or suggestions as pending rather than verified.

## Monetizable Data

Appurdex can sell its own derived dataset:

- verification state
- source URL
- last checked date
- source-change history
- normalized category
- repo/package activity
- review status
- vendor-claimed status
- provenance and resale notes

Do not sell raw third-party databases or copied review/pricing content unless the license explicitly allows resale.
## Monetization Surfaces

Freemium and paid surfaces must use stored Appurdex records only:

- Natural-language search can parse user intent, but results must come from the current catalog, source checks, snapshots, pricing rows, and review events.
- History fields are derived from `metricSnapshots`, `githubMetrics`, `sourceChecks`, reviewed pricing/model-pricing source checks, and review/change events.
- Alerts and webhooks are emitted only for real review/source-change events.
- AppurScore is a derived score from available source-backed signals. Missing inputs must lower confidence or stay unknown, not be filled with guessed values.
- Recommendations, migration notes, editorial notes, and team workspace data must remain empty or unavailable until stored review data exists.
