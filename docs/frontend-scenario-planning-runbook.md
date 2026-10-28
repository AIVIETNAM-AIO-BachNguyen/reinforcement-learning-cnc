# Scenario Planning frontend — setup and verification

## Version and scope

Base: `c926d5d24566834850cf4a16af0792af9c7d50fd`.
Backend proposal dependency: #56 `aa56ecfceb85b6d6f78158ac34d37440103942a4`.
[Route map, wireframe and G1–G6 handoff](frontend-scenario-planning.md).

This is the independent frontend editor/read scaffold, not M2/M3 or
VERIFIED_DONE. Main does not serve Scenario APIs on this base. Backend #56 has
storage routes, but explicitly lacks the executable Scenario engine worker,
reviewed engine/compare DTO and implemented compare/sensitivity routes. No real
Scenario engine run IDs or golden outputs were provided. Backend/Flex own those
dependencies; Frontend does not modify their application/schema/DB to compensate.

## Local setup

Use the existing Node 22.22.2+ release line and locked dependencies. In `frontend`:

```sh
npm ci
npm run contracts:check
npm run dev
```

Use the existing local API base URL, factory setting and HttpOnly-cookie login.
Do not commit credentials or a local authentication bypass. Workspace endpoints
use real authenticated HTTP with no-store, never a fixture-backed production
adapter. Against current main, missing Scenario routes produce an explicit
unavailable/access state. Against the pinned experimental Backend dependency,
workspace/draft storage additionally requires the Backend owner's explicitly
configured reviewed version identity and migrated dedicated environment; an env
string alone is not proof of evaluator compatibility. Do not point test runners
at the user's development/production database or invent engine versions to demo
success. This task does not migrate/seed/reset a database.

`/operations/what-if?factory_id=F` redirects to production
`/operations/scenarios?factory_id=F`. The old fixture requires explicit
`/operations/what-if?demo=1`. `demo=1` on a Scenario route stops at a live-only
boundary with no Scenario read/write. It cannot silently turn into live mode.

## Review the independent flow

1. List/open workspaces in one factory. The URL retains factory and opaque cursor;
   displayed count is the current page, never an invented total. Create reviews
   the synchronized current Operations snapshot/head and planning config.
2. Select a saved scenario or new draft. The editor only uses Technician and
   maintenance-request entities whose factory/snapshot identity equals the pinned
   immutable basis. Current S2 never replaces historical S1. Without an immutable
   entities endpoint, historical metadata and saved assumptions remain readable
   but adding/editing targets is unavailable. A missing publication is shown as
   absent, not interpreted as infeasible.
3. Choose one of three templates. At most five type/target pairs; duplicate pairs
   are rejected. Unavailability is a nonempty in-window UTC interval, defer is a
   lower bound before window end, duration is finite 1–43200 minutes. Five weights
   are finite 0–1000000 with sum above canonical tolerance. The browser validates
   input only; it does not transform snapshots, hash application inputs, normalize
   weights, validate schedules or score feasibility.
4. Review requested changes and weights before save. This is not the engine's
   effective-transform/constraint verdict. PATCH uses the revision read when the
   form was opened. A newer revision keeps the user's draft and requires explicit
   review before a new key/body/revision. Background reads disable editing.
5. Read a saved job by URL. QUEUED/RUNNING polls 2s→4s→8s→15s maximum delay,
   stops at terminal/error/unmount and aborts stale reads. Status/attempt/source
   revision/versions/deadline are metadata, not a feasibility or quality verdict.
   Unknown result objects are never interpreted as KPI/schedule/strategy.
6. Select at most four completed runs: one no-overrides baseline plus up to three
   scenarios. Bounded selected-run detail reads preserve selection across pages.
   Authoritative comparison metrics and normalization remain unavailable.
7. Prepare a single duration/weight sweep with five explicit values by default,
   at most seven unique bounded points. No sweep is submitted until frozen inputs,
   result/interval/sampling DTO and callable service are reviewed. No dummy chart,
   interpolated failure KPI, rank-change threshold or confidence is displayed.
8. LIVE review is separate and only offered for a completed saved scenario. It
   reads current context and shows historical differences. Submission stays
   disabled: the proposal lacks source eligibility/frozen overrides read, DEFER
   cannot be expressed in canonical LIVE yet, and physical assumptions require
   authorized ingestion. No simulation COMMIT/approval or Work Order source.

ADMIN/ENGINEER may create/edit; OPERATOR/VIEWER are read-only. UI gating is not
authorization. Fresh identity checks fence reads and writes; server transaction
checks remain authoritative. Actor/factory changes drop old data, cancel reads
and remove old forms. Definitive write authorization loss invalidates protected
reads and rechecks the session.

## Idempotency, errors and reload

Each explicit write freezes key/body/revision in actor/factory-scoped RAM. Pending
blocks duplicate submit and field changes. A receipt is followed by authoritative
GET before navigation/current form update. A failed follow-up GET is an uncertain
outcome, never permission to send a different create/save intent.

Network/timeout/abort/5xx keeps the original request for manual retry. Definite
4xx requires review; 409 never auto-rebases tokens or uses latest draft input as
a job retry. Retry of the same HTTP intent is distinct from a new engine attempt;
the producer has no public attempt-retry endpoint. No mount/focus/reload enqueues
work. In-progress and failed jobs are not presented as good candidates.

Unsaved drafts and unconfirmed bodies are memory-only, with link/unload warnings.
Hard reload/browser restart discards them; reconcile saved workspace/draft/job
reads before a new intent. Exactly-once HTTP recovery across a hard reload is not
claimed without the original key/body. No Scenario note/reason/token is placed in
localStorage/sessionStorage. No raw backend stack or report is displayed/logged;
error code mapping is safe and request IDs are available for support.

## Checks and evidence

```sh
npm run contracts:check
npm run typecheck
npm run lint
npm test
npm run test:browser
npm run build
SCENARIO_CAPTURE=1 npm run test:scenarios:desktop
```

Windows may set `OPERATIONS_BROWSER_EXECUTABLE` to installed Edge/Chromium.
The default browser script runs existing regressions then the dedicated Scenario
desktop suite sequentially. Do not overlap Next dev browser tests and production
build; both use `.next`. Desktop sizes: 1440×900, 1920×1080 and 2560×1440.
Existing mobile regressions remain; this task adds no mobile redesign.

[`screenshots/scenario-planning/contract-harness`](screenshots/scenario-planning/contract-harness)
contains **component/HTTP contract evidence only**, using static test payloads.
It is not API/PostgreSQL/worker/Flex acceptance. No fixture adapter is exported
from production code. Tests cover all three overrides, bounds/window/duplicate
validation, requested diff, conflict/new-key review, lost-response exact replay,
stale response/abort, pending polling progression, safe auth/network/unavailable,
historical basis protection, unknown-result rejection, per-point timeout/failure
retention, compare bounds, sensitivity input and gated LIVE review.

Pending full acceptance: actual engine baseline/scenario runs, authoritative KPI
units/delta/direction/normalization/constraints and candidate Gantt; 5-point duration
and weight sweeps with replay/UUID-invariance; complete LIVE handoff through new
planner/approval; two-factory role/concurrency/revoke/commit-denial checks; three
consecutive clean-schema joint browser runs at a final integrated dependency SHA,
real screenshots/logs/runtime/cleanup. Existing Operations/Incident/Work Order
regression runs do not substitute for any Scenario acceptance item.
