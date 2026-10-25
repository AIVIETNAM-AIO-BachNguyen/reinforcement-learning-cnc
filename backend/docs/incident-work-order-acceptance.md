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

## Requirement-to-evidence map

All tests below use actual authenticated HTTP and PostgreSQL. The browser uses a
real dedicated worker and FastAPI planner. Producer integration fixtures generate
contract-valid recommendations for transaction-focused tests; they do not replace
the browser's real planner proof. Fault injection tests retain real DB transactions.

| Requirement | Executable evidence |
| --- | --- |
| UI report, severity, assignment, ACK, investigation, resolve, independent close, reopen | `frontend/e2e/incidents.spec.ts`; desktop captures at 1280/1440/1920 |
| LIVE worker/planner, separate APPROVE/COMMIT, actual maintenance publication, links | Same browser test and `tests/planning/work-order-worker-flow.test.js` |
| Active/COMPLETED order blocks resolution; close does not close incident | Browser test plus `tests/integration/incident-links.postgres.test.js` |
| Both access-loss recovery paths on a linked order, no regrant, original start/completion retained | `incident-links.postgres.test.js`: linked recovery/S2/P2/restart scenario |
| S2/P2 preserve P1/S1, reopen preserves reports, both modules survive two independent API processes | Same linked recovery scenario; compares responses, source, snapshots/head and old completion rows |
| Fresh active-user checks, VIEWER, non-assignee, self-verifier, revoked/inactive, stale and replay | `work-orders.postgres.test.js`, `incidents.postgres.test.js`, browser role/stale assertions |
| Duplicate creation, competing commands, head-change/create, both lock orders for revoke/write/replay/recovery | Coordinated real-connection tests in `work-orders.postgres.test.js` |
| Linked producer cancellation versus incident resolution | Coordinated factory-lock test in `incident-links.postgres.test.js` |
| SIMULATION_ONLY/uncommitted/production/cancelled source, unavailable target | `work-orders.postgres.test.js`, `incidents.postgres.test.js`, `incident-links.postgres.test.js` |
| Atomic audit/history/receipt, no side effects after rejected command | Transaction fault tests in `work-orders.postgres.test.js`; DB receipt-failure trigger in `incidents.postgres.test.js` |
| Scoped callable lookup, bounded ordered summaries, no private reports, no-store, DB unavailable | `work-orders.postgres.test.js` and real Incident producer adapter integration |
| Stable pagination, historical machine, overdue/waiting, cursor boundaries | Work Order HTTP/PostgreSQL tests plus Incident browser pagination/back/reload |
| Both migrations on fresh DB and exact-base populated upgrade | Every isolated runner plus `incident-upgrade.postgres.test.js`; historical data and checksums compared |

The linked recovery scenario was added after the initial `e6a85b6` acceptance
checkpoint. It passed with the full targeted suite (18 tests). The final successor
SHA still requires its own three clean browser runs and final CI, rather than
borrowing green results from that earlier checkpoint.
