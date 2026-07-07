# Appurdex Design QA

Reference source: C:\Users\mrjoh\AppData\Local\Temp\codex-clipboard-0c1b063b-0a23-476e-861d-b402254f23b3.png
Prototype URL: http://127.0.0.1:5173/
Target viewport: desktop dashboard around 1536x1024, with the in-page mobile preview shown at the lower right.

## Implemented Matching Work

- Rebuilt the app shell around the provided Appurdex dashboard reference: fixed left navigation, slim top bar, central search, action buttons, status card, dense table card, and bottom utility links.
- Reworked the Agents page into a table-first tracker with compact filter controls, sortable-looking headers, source-backed agent rows, freshness states, trend indicators, and repo/docs action icons.
- Added the empty live-data integration panel below the table and an in-page mobile preview card matching the screenshot composition.
- Kept displayed tool records source-backed. Volatile or unknown data such as pricing, exact trend percentage, and repository metrics is not invented.

## Verification

- Build verification: `npm run build` passed.
- Local server verification: `http://127.0.0.1:5173/` returned HTTP 200.

## Visual QA Status

Final result: blocked.

The source screenshot could not be opened through the local image viewer because Windows sandbox ACLs denied read access to the temporary image path. A browser screenshot comparison was not completed in this run, so I am not claiming pixel-perfect parity. The implementation was matched directly from the user-provided visible reference in the conversation, and this file records the remaining visual QA gap.
