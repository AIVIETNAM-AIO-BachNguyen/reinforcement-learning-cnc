# Decision Cases / audit timeline screenshots

Source: `NEXT_PUBLIC_OPERATIONS_API_MODE=real` + the HTTP adapter + Playwright's
canonical stateful contract harness. These illustrate frontend rendering and
interactions, **not real PostgreSQL/backend acceptance**. Every image is captured
by `frontend/tests/browser/decision-cases-audit.spec.ts`; long IDs/hashes wrap,
and viewport overflow is asserted. The development toolbar is hidden only in
the screenshot, not in the application. Component crops also omit the outside
sticky application header, to avoid covering a stitched tall component image;
full-page loading/empty/error/auth captures retain it normally.

| State | Desktop 1440 px | Mobile 390 px |
| --- | --- | --- |
| Filtered committed case, basis/head/publication | [Desktop](list-success-desktop.png) | [Mobile](list-success-mobile.png) |
| Four-page complete audit with publication metadata | [Desktop](timeline-success-desktop.png) | [Mobile](timeline-success-mobile.png) |
| Loading | [Desktop](loading-desktop.png) | [Mobile](loading-mobile.png) |
| Empty filter | [Desktop](empty-desktop.png) | [Mobile](empty-mobile.png) |
| Network error | [Desktop](error-desktop.png) | [Mobile](error-mobile.png) |
| Authorization denial, previously loaded rows removed | [Desktop](authorization-desktop.png) | [Mobile](authorization-mobile.png) |

Run `npm run test:browser -- decision-cases-audit.spec.ts` with
`OPERATIONS_CAPTURE_SCREENSHOTS=1` to recapture. Real-service screenshots belong
to `npm run test:cases:live` artifacts, with `real-api-evidence.json` and the
tested SHA; do not label these harness images as real-service screenshots.
