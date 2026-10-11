# Decision case discovery (read API)

Contract-first handoff: [OpenAPI](../../openapi.yaml), [TypeScript DTO](decision-case-list.d.ts),
[response example](../../examples/decision-cases.list.json).

```http
GET /api/v1/decision-cases?factory_id=factory-1&status=AWAITING_APPROVAL&mode=LIVE&limit=25
Authorization: Bearer <token>
```

`factory_id` is required. `status` and `mode` each accept one exact value and combine
with AND. Omit a filter to include all its values. Unknown/repeated parameters and
invalid limits return 400 `VALIDATION_ERROR`. Default limit is 25, maximum 100.
All authenticated roles can read factories they may access; ADMIN can access any
existing factory. Unknown and inaccessible factories return the same 404
`FACTORY_NOT_FOUND`. An accessible factory with no matching cases returns an empty page.

```ts
const query = new URLSearchParams({ factory_id: factoryId, limit: '25' });
// Add the same status/mode filters on every page when selected.
if (nextCursor !== null) query.set('cursor', nextCursor);
const response = await fetch(`/api/v1/decision-cases?${query}`, { credentials: 'include' });
const page = await response.json();
// Render page.data; use item.decision_case_id to open existing case detail APIs.
// Continue only if page.meta.has_more; persist factory/filter selection for rediscovery.
nextCursor = page.meta.next_cursor;
```

Order is `created_at DESC, id DESC`. The opaque signed cursor preserves PostgreSQL
microseconds, even though display timestamps use ISO milliseconds. Never construct
a cursor from display timestamps. Cursors are bound to the actor, factory, status
and mode; changing any requires a new first page. Limit can change between pages.
Malformed, altered, unsupported or mismatched cursors return 400 `INVALID_CURSOR`.
Cursors have no time expiry, but signing-key rotation invalidates them. They grant
no access: authentication and factory authorization run for every page.
The final/empty page has `has_more: false` and `next_cursor: null`.

Fixed data has no duplicate or missing items across pages, including equal timestamps.
Each page reads case/head/decision/publication from one repeatable-read transaction.
Pagination does not hold a snapshot across requests: newly inserted cases or changed
status filters can change the result set. Restart without a cursor to refresh.

Items expose canonical status fields plus factory, case revision, basis plan version,
current head context, stale and concise human/publication summaries. No raw request,
snapshot, artifact, note, lease or receipt is selected or returned. `stale` compares
the original case basis with the current head; a committed case can therefore be stale
after its own commit. Candidate version, case revision and head plan version remain
different values. Existing detail, command and canonical status contracts are unchanged.

## Events

```http
GET /api/v1/decision-cases/<caseId>/events?after_sequence=0&limit=100
```

`after_sequence` is exclusive and defaults to zero. Limit defaults to 100 (1..200).
Events are ordered by per-case sequence ASC, independent of timestamps. Continue or
poll using `meta.next_after_sequence`; an empty page echoes the supplied sequence.
Sequence is not case revision: heartbeat updates can increment revision without events.
Unknown/repeated/invalid parameters return 400; missing/inaccessible case returns 404.

Actor kind/id and occurrence time come from the server. Human transition events for
APPROVE/REJECT/COMMIT include command, recommendation/candidate IDs, candidate version,
candidate/schedule hashes and head plan version. REJECT candidate fields are null.
APPROVE/REJECT leave the head unchanged; COMMIT's event carries the new head version.
Publication identity/basis/time are in detail `meta.commit` and current-schedule commit
metadata. Worker transitions have SYSTEM actors and can omit command fields. Unknown
event types have an empty public payload. Raw stored payloads and notes are not exposed.

Both endpoints are read-only and return `Cache-Control: no-store`.
