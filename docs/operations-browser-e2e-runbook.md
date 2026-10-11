# Operations browser E2E and demo runbook

This runbook exercises the real integration path:

```text
isolated PostgreSQL schema
  -> canonical demo snapshot
  -> authenticated browser
  -> backend Decision Case API
  -> Decision Case worker
  -> real FastAPI /v1/operations/plan
  -> persisted RecommendationPackage
  -> browser Recommendation Center
```

The harness never enables the frontend fixture adapter. It sets
`NEXT_PUBLIC_OPERATIONS_API_MODE=real` and fails if a recommendation is not
available from the persisted backend artifact.

## Prerequisites

- Node 22.22.2 or newer in the Node 22 release line
- Python 3.12, `uv`, and the locked `ai_services` environment
- PostgreSQL 16 reachable through a dedicated database ending in `_test` or
  `_ci`
- Backend and frontend dependencies installed
- Playwright Chromium installed

Example setup:

```bash
npm ci --include=dev --prefix backend
npm ci --include=dev --prefix frontend
uv sync --frozen --group dev --python 3.12 --project ai_services
npm --prefix frontend exec playwright install chromium
```

Do not point the commands below at a development or production database. The
harness rejects database names that do not end in `_test` or `_ci`.

## One-command integration run

```bash
export TEST_DATABASE_URL='postgresql://operations_test:operations_test_only@127.0.0.1:5432/operations_test?schema=public'
export OPERATIONS_SCHEMA_JOURNAL='/tmp/operations-browser-e2e-schemas.jsonl'
node scripts/run-operations-browser-e2e.js
```

The command creates a random `product_api_it_browser_*` schema, deploys all
migrations, seeds the platform admin and canonical `factory-demo-01` snapshot,
then starts FastAPI, the backend API, the Decision Case worker, and Next.js on
temporary ports. Readiness is checked before Chromium starts. All processes,
ports, and the schema are cleaned in `finally`, on SIGINT, and on SIGTERM.

Expected positive states are:

```text
CREATED -> ANALYZING -> GENERATING -> VALIDATING
        -> EXPLAINING -> AWAITING_APPROVAL
```

The browser verifies 1–3 valid candidates, matching factory/snapshot/case IDs,
ordered event history, and the same persisted package after reload.

The full gate runs the lightweight Next.js browser contract suite first and
waits for its web server to stop before starting this real-service suite. The
two Next.js processes never overlap. The real-service harness owns temporary
ports and a `product_api_it_browser_*` schema, and removes every process, port
and schema from `finally` on pass, failure, `SIGINT`, or `SIGTERM`.

## Three consecutive demo runs from reset

Each repetition uses a newly migrated schema, so it starts from a complete
database reset rather than deleting selected business rows:

```bash
node scripts/run-operations-browser-e2e.js --repeat=3
```

Evidence is written under:

```text
artifacts/operations-e2e/<git-sha>/
  summary.json
  summary.md
  run-1/evidence.json
  run-2/evidence.json
  run-3/evidence.json
  run-*/{migration,seed,backend-api,decision-worker,fastapi,frontend,playwright,cleanup}.log
  run-*/playwright/{html-report,test-results}/
```

Within every run, the suite reconstructs the exact persisted
`RunDecisionCaseRequest`, submits it to the real FastAPI endpoint twice, and
requires both complete responses to equal the artifact persisted by the worker.
This is the deterministic replay check for identical input.

Across the three reset runs, newly generated Decision Case IDs intentionally
change case-scoped plan IDs and Monte Carlo seeds. The cross-run semantic
fingerprint therefore compares the strategy set, deterministic planning KPIs,
validation verdicts, resource assignments, statuses, and schedule times. It
excludes case-scoped identifiers, measured latency, and seeded risk-simulation
KPIs; candidates are sorted by strategy before hashing.

## Negative checks

The current suite verifies:

- unauthenticated Operations API access returns `401`;
- a stale plan version cannot create a case;
- losing the first create response, reloading Overview, and explicitly recovering
  reuses the stored key/body and returns the original case; no new case is created;
- recovery is scoped to the original actor; a different signed-in actor cannot replay it;
- a `SIMULATION_ONLY` case cannot commit;
- a real planner failure leaves the current snapshot, plan version, and schedule
  byte-for-byte unchanged;
- a browser reload reads the same persisted recommendation and complete event
  sequence.
- a confirmation opened against an old case/head revision receives `409`, asks
  the operator to review the refreshed case, and never rewrites tokens or
  automatically submits a second command;
- two approved LIVE cases with one immutable basis race to commit; the suite
  discovers the winner from the responses and requires exactly one publication
  and one plan-version increment;
- the winning commit receipt replays byte-for-byte with its original key/body,
  while the losing request leaves its case, events, receipts and publications
  unchanged;
- real-service rejection, VIEWER read-only permissions and factory isolation;
- signed-cursor paging and LIVE/status filters, plus a close/reopen tab recovery
  using the case rediscovered from the service;
- the complete public event timeline matches the PostgreSQL event sequence,
  actor, type, timestamp and allowlisted payload fields.

The harness now includes main's decision endpoint. Simulation approval must return
`200`, and its commit must return `409 SIMULATION_ONLY` with no change to the case,
head, schedules, or publications. A missing endpoint is a failure. The LIVE UI also approves and commits the original case. Each response is dropped
after the backend succeeds, then recovered after reload with the same key/body.
Approval leaves the schedule unchanged; commit publishes the exact approved
schedule once and advances the plan version by one. Reload never sends a POST.
The committed actor is checked against the authenticated creator.

Main currently has the Decision Case list/read API but no frontend case-list
screen. The service pagination/filter and direct-link close/reopen recovery are
therefore asserted and recorded as passed; evidence records
`frontend_case_list_navigation: not_available` rather than claiming a browser
list UI was exercised. Once that screen exists, replace this marker with an
actual UI assertion before it may become `passed`.

## Evidence rules

An evidence check is written as `passed` only after its assertion completes.
The evidence file is written at the end of the test, so a failed assertion
cannot leave a misleading successful run record. Missing product capability is
written as `not_available`; it is never treated as enforcement passing.

CI invokes the real-service suite with `--repeat=3`. Each repetition migrates a
different empty schema, starts PostgreSQL-backed API/worker/FastAPI/Next.js and
real Chromium, and cleans the whole scope before the next repetition. The
summary is keyed by the tested Git SHA and is created only when all three runs
pass.

## Explicit long-lived demo schema reset

For a local demo schema, use a dedicated database ending in `_demo`, `_test`, or
`_ci` and a schema beginning with `operations_demo_`:

```bash
export NODE_ENV=test
export OPERATIONS_DEMO_DATABASE_URL='postgresql://operations_demo:password@127.0.0.1:5432/operations_demo?schema=operations_demo_local'
npm --prefix backend run operations:e2e-reset
```

The reset script validates both database and schema names, confirms the actual
database connection, and drops/recreates only the explicit
`operations_demo_*` schema. It cannot target `public`.

After reset, deploy migrations and seed the same explicit URL before starting
services:

```bash
export DATABASE_URL="$OPERATIONS_DEMO_DATABASE_URL"
npm --prefix backend exec prisma migrate deploy --schema prisma/schema.prisma
export ADMIN_PASSWORD='choose-a-local-demo-password'
node backend/prisma/seed.js
node backend/scripts/seed-operations.js factory-demo-01
```

## Failure recovery

1. Open `run-N/playwright/html-report/index.html` and inspect the retained trace,
   screenshot, and video.
2. Review service logs in the same run directory. Request and correlation IDs
   are preserved by the backend and worker.
3. Run the journal cleanup if an external hard kill prevented normal cleanup:

   ```bash
   node backend/tests/integration/run-integration-tests.js --cleanup
   ```

4. Confirm no `product_api_it_browser_*` schema remains and rerun from a fresh
   schema. Never manually clean `public` or a development database.

In CI, evidence is uploaded even when the gate fails. The final `always()` step
uses the same schema journal to recover an interrupted runner while preserving
the existing migration-history, fresh-install, base-SHA upgrade, contract,
backend, frontend, planning, and worker gates.
