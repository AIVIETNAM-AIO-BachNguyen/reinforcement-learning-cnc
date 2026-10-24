# Incident Center implementation

Milestone: IN_PROGRESS. This is not final acceptance evidence.

- Task: completion brief dated 2026-10-23 (new implementation, not the old contract PR).
- Branch: `backend/incident-center-implementation`.
- Exact base: `ff9a3aeec7d6f3b19e655a326cea214a968764c0` (includes Work Orders #51 and desktop #50).
- Checkout: `incident-center-implementation`; original unfinished checkout remains untouched.
- Incident-owned migration: `20261022020000_factory_incidents`.
- Producer: `work-order-read.service.js::lookupWorkOrderSummaries`, inherited from exact base.
- Policy/evidence: reuse reviewed main modules; no competing lifecycle policy.

## Checks performed during implementation

- 47 policy/evidence/source/Work Order adapter unit tests passed.
- 11 authenticated HTTP/PostgreSQL incident tests passed on isolated schemas.
- Populated upgrade from exact base passed, preserving a real Work Order,
  publications, memberships and append-only history (12 API/upgrade tests total).
- 234 frontend unit/component tests passed; production build and TypeScript passed.
- Real browser manual and linked planner/Work Order smoke flows passed, with
  desktop screenshots and clean schema/process/port shutdown. These were dirty-tree
  development runs, not final-SHA acceptance.
- Fresh deployment of all 17 migrations, including both modules, passed.
- Test runner dropped its schema after both successful and failed runs.
- These are local intermediate results, not three final-SHA E2E runs.

## Still pending

Expanded negative/concurrency/browser recovery matrix; three clean-schema browser
runs at the final SHA; draft PR
and final CI gates. See [demo runbook](incident-center-demo-runbook.md).

## Targeted local API check

Use an explicitly supplied disposable `TEST_DATABASE_URL`, never development DB.
Set `OPERATIONS_PYTHON` to the environment containing the Operations validator.
Set `OPERATIONS_SCHEMA_JOURNAL` to a writable artifact file for interrupted-run cleanup.

```sh
cd backend
node tests/integration/run-integration-tests.js --incidents
# Recovery after an interrupted runner, with the same explicit URL and journal:
node tests/integration/run-integration-tests.js --cleanup
```

Normal integration runs (without `--incidents`) still include all integration tests.
No skip, unavailable dependency, or unexecuted assertion counts as passed.
