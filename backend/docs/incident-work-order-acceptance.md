# Incident / Work Order joint acceptance

Status: IN_PROGRESS. This follow-up is stacked on Incident Center PR #54 at
`50eb879866983204fd84f694ab6d0d214e1611dc`, which includes main
`ff9a3aeec7d6f3b19e655a326cea214a968764c0` and merged Work Orders #51.
It does not change product APIs, the Incident UI, or the planner.

## Planner replay gate correction

At the dependency SHA, all three isolated Incident browser runs passed locally,
then the final cross-run fingerprint assertion failed. CI Operations run
40102829509 failed at the same assertion after three successful browser runs.
Contracts run 40102829483 passed.

Each fresh schema creates a new case ID. The planner derives schedule IDs from
that case ID, and Monte Carlo sampling includes schedule ID in its seed. Thus
different cases can rank different strategies first even with identical snapshot
and planning configuration. Comparing only the selected strategy across cases is
not a valid deterministic-replay assertion.

The harness now verifies two separate properties, without replacing the planner:

1. Replay the exact request recorded from the real worker against the real
   FastAPI endpoint, and compare the complete response with the recommendation
   persisted in PostgreSQL. IDs, ranking, risk estimates and scores must match.
2. Across clean schemas, compare the complete set of candidate schedules by
   strategy, including assignment times, machines, jobs, maintenance requests,
   technicians, statuses, locks, candidate versions and validation verdicts.
   Case-derived opaque IDs and stochastic ranking are excluded only here.

The original selected-candidate fingerprint remains in each browser evidence file
for diagnosis. `planner_replay` records the additional checks. Missing recorded
requests, failed HTTP replay, or any full-response mismatch fails the run.

## Reproduce

Use Node 22.22.2+, installed backend/frontend dependencies and Playwright Chromium,
and a Python environment containing the actual planner. Supply an explicit
`TEST_DATABASE_URL` ending in `_test` or `_ci`; never use the development database.

```sh
cd backend
node node_modules/jest/bin/jest.js --runInBand tests/incident-planner-evidence.test.js
MIGRATION_BASE_SHA=ff9a3aeec7d6f3b19e655a326cea214a968764c0 \
  node tests/integration/run-integration-tests.js --incidents
npm run operations:incident-demo -- --repeat=3 --acceptance
```

Each browser run deploys all migrations to a fresh schema, runs real authenticated
UI/API/planner/worker flows, and records its SHA plus cleanup results. The
populated-upgrade test separately checks exact-base migration checksums and
historical records. Evidence belongs under `artifacts/operations-e2e/<SHA>`.
Do not publish authentication cookies or browser traces containing sessions.

Passing this targeted harness alone does not mean VERIFIED_DONE. The full negative
and recovery matrix, final Contracts/Operations CI, and final-SHA evidence must
all be audited before joint acceptance is declared complete.
