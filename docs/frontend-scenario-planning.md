# Scenario Planning frontend — contract and route handoff

Base main: `c926d5d24566834850cf4a16af0792af9c7d50fd`, 2026-10-27.
Branch: `frontend/scenario-planning-workspace`. Backend draft #56 dependency:
`aa56ecfceb85b6d6f78158ac34d37440103942a4`. #54 is actually merged on this base;
#55 remains separate acceptance work. No Scenario dependency on Incident.

The shared brief and the supplied Flex task are requirements, not frozen DTOs.
Backend explicitly labels its OpenAPI M0 proposal, NOT_API_READY, with
EngineResult/Comparison PENDING_FLEX. No executable Scenario worker or implemented
compare/sensitivity routes exist on that dependency. This frontend must not
manufacture those response fields or claim full completion from contract tests.

## Routes and desktop wireframe

| Route | Responsibility |
| --- | --- |
| `/operations/scenarios?factory_id=F&cursor=opaque` | Scoped workspace list and current-context creation review |
| `/operations/scenarios/[workspaceId]?factory_id=F&scenario_id=D&run_id=R&compare=R1,R2&sensitivity_id=S` | Immutable baseline, editor/review, run inspector, comparison selection and sensitivity |
| `/operations/what-if` | Production entry redirects to Scenario Planning; old fixture is only accessible with explicit `demo=1` |

```text
Scenario Planning                         Factory / create / refresh
Saved workspace | baseline snapshot / publication | versions | stale

Workspace: baseline S1/P1 — config / engine — creator — historical flag
Draft selector + revision     | Targeted overrides + 5 objective weights
Review requested changes     | Save explicit revision / Run (gated)
Saved runs + status/attempt   | Baseline + <=3 scenarios / compare
Sensitivity inputs <=7 points| Result/diagnostics/intervals (gated)
Evaluate LIVE: current context + confirmation (gated)
```

Hashes belong in expandable provenance. Reuse AppShell/tokens, sticky tables,
labelled keyboard forms and 1440×900 / 1920×1080 / 2560×1440 layouts. No mobile
redesign. No changes to Incident/Work Order product flows.

## API map and concrete dependencies

| Contract surface | Frontend implementation / safe boundary |
| --- | --- |
| Workspace POST/list/detail | Pinned generated producer-proposal DTOs; real HTTP only; idempotency/head fence; no snapshot from fixtures |
| Draft POST/list/detail/PATCH | Full replacement fields, expected_revision, duplicate/window/bounds validation, explicit review on conflict |
| Baseline entities | **G1 Backend:** Workspace DTO lacks immutable snapshot/entities read. Reuse current Operations snapshot only if factory + snapshot ID exactly match immutable workspace basis. When S2 differs, historical metadata/drafts remain readable, target editor fails closed; never substitute S2. Need scoped immutable basis/entities and sampling/reference read DTO. |
| Run enqueue/list/detail | **G2 Backend/Flex:** no executable worker, frozen-input/attempt-history read or reviewed engine result/sampling DTO. Read existing job metadata; prepare explicit run review but disable enqueue until reviewed/callable integration. Never render unknown `result` fields as KPI. |
| Compare | **G3 Flex/Backend:** `Comparison` is explicitly unfrozen and route unimplemented. Prepare URL-bound <=4 completed selections (baseline + <=3 scenario), no score/delta/calculated KPI model. Need authoritative metrics/units/direction/null reasons/contributions/normalization/tie-break, schedule and constraints DTOs and golden outputs. |
| Sensitivity | **G4 Flex/Backend:** proposal-only endpoints; authoritative per-point aggregate/interval/result/sampling contract missing. Build bounded input review and existing job metadata inspector; no fake chart, reranking, breakpoints or confidence. |
| Evaluate LIVE | **G5 Backend/Flex:** weights-only route exists in proposal; DEFER cannot map through current canonical LIVE schema. No frozen override/mapping eligibility read. Keep handoff disabled until saved-source eligibility and reviewed schema are available. No WHAT_IF-in-LIVE workaround, approval or COMMIT simulation. |
| Retry attempts | **G6 Backend:** no public retry-attempt endpoint in proposal. Read attempt number, retry GETs / original uncertain HTTP intent only; never enqueue draft-latest as a job retry. |

Proposed APIs are consumed as an explicit pinned proposal, not added to shared
OpenAPI by Frontend. `frontend/contracts/scenario-planning.proposal.openapi.json`
is a mechanical consumer snapshot from the exact producer SHA. Generated DTOs,
response schemas and a dependency manifest preserve its unresolved schemas.
`contracts:check` verifies deterministic consumer generation. A backend merge alone
does not change manifest capabilities or prove Flex compatibility.

No external messages/task assignment, merge, deployment, backend/engine edits or
database modifications. Continue independent UI/client/read/editor/test work.
M2/M3 and three actual engine-backed clean-schema browser runs remain pending;
component/HTTP contract fixtures are isolated evidence only.
