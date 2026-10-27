const { randomUUID } = require('node:crypto');
const db = require('../../src/config/prisma');
const app = require('../../src/app');
const { fixture } = require('../helpers/work-order-fixtures');
const example = require('../../../contracts/v3/examples/demo-scenario.json');
const saved = Object.fromEntries(['FACTORY_ACCESS_SOURCE', 'SCENARIO_ENGINE_VERSION', 'SCENARIO_CONTRACT_VERSION', 'SCENARIO_SAMPLING_VERSION'].map(key => [key, process.env[key]]));
let f, a, b;
beforeAll(async () => {
  process.env.FACTORY_ACCESS_SOURCE = 'database';
  // This suite verifies HTTP/persistence only; these identities do not claim a real engine run.
  process.env.SCENARIO_ENGINE_VERSION = 'storage-test';
  process.env.SCENARIO_CONTRACT_VERSION = 'storage-test';
  process.env.SCENARIO_SAMPLING_VERSION = 'storage-test';
  f = await fixture(db, app);
  a = await f.factory(); b = await f.factory();
}, 60000);
afterAll(async () => {
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  if (f) await f.close();
  await db.$disconnect();
});
async function request(snapshot = a) {
  const head = await db.operationsHead.findUnique({ where: { factoryId: snapshot.factory_id } });
  return { factory_id: snapshot.factory_id, name: ' Scenario test ',
    expected_head: { snapshot_id: head.snapshotId, plan_version: head.planVersion, revision: head.revision },
    planning_config: { ...example.planning_config, candidate_limit: 3, solver_timeout_seconds: 30, simulation_runs: 100,
      allowed_strategy_ids: ['PRODUCTION_PRIORITY', 'BALANCED', 'RELIABILITY_PRIORITY'] } };
}
async function create(snapshot = a, user = f.users.MANAGER) {
  const response = await f.http('/scenario-workspaces', { method: 'POST', user, body: await request(snapshot) });
  expect(response.status).toBe(201);
  expect(response.cache).toBe('no-store');
  return response.body.data;
}
const path = row => `/scenario-workspaces/${row.workspace_id}`;
function draft(snapshot = a) {
  return { name: 'Duration', note: '', objective_weights: example.planning_config.objective_weights,
    overrides: [{ type: 'MAINTENANCE_DURATION', maintenance_request_id: snapshot.maintenance_requests[0].maintenance_request_id, expected_duration_minutes: 90 }] };
}
test('ADMIN/ENGINEER can write; VIEWER/OPERATOR read but cannot write; inactive/tokenless denied', async () => {
  const w = await create();
  for (const user of [f.users.ADMIN, f.users.MANAGER, f.users.VIEWER, f.users.OPERATOR])
    expect((await f.http(path(w), { user })).status).toBe(200);
  for (const user of [f.users.VIEWER, f.users.OPERATOR])
    expect((await f.http('/scenario-workspaces', { user, method: 'POST', body: await request() })).status).toBe(403);
  for (const user of [f.users.INACTIVE, null]) expect((await f.http(path(w), { user })).status).toBe(401);
});
test('factory-scoped detail/list/draft prevent guessed IDs and unknown query fields', async () => {
  const w = await create();
  const other = await create(b);
  const created = await f.http(`${path(w)}/scenarios`, { method: 'POST', body: draft() });
  expect(created.status).toBe(201);
  const d = created.body.data;
  expect((await f.http(`${path(other)}/scenarios/${d.scenario_id}`)).status).toBe(404);
  expect((await f.http(path(w), { user: f.users.OUTSIDER })).status).toBe(404);
  expect((await f.http(`/scenario-workspaces?factory_id=${a.factory_id}`, { user: f.users.OUTSIDER })).status).toBe(404);
  expect((await f.http(`/scenario-workspaces?factory_id=${a.factory_id}&factory_id=${b.factory_id}`)).status).toBe(400);
  expect((await f.http(`${path(w)}?debug=true`)).status).toBe(400);
});
test('lost-response replay returns original identity, different body conflicts, revoke blocks replay', async () => {
  const key = randomUUID(), body = await request();
  const options = { method: 'POST', user: f.users.OTHER, body, key };
  const first = await f.http('/scenario-workspaces', options);
  expect(first.status).toBe(201);
  const replay = await f.http('/scenario-workspaces', options);
  expect(replay.body).toEqual(first.body);
  expect(replay.replay).toBe('true');
  expect((await f.http('/scenario-workspaces', { ...options, body: { ...body, name: 'different' } })).status).toBe(409);
  expect((await f.member(a.factory_id, f.users.OTHER, 'DELETE')).status).toBe(200);
  expect((await f.http('/scenario-workspaces', options)).status).toBe(404);
  expect((await f.http(path(first.body.data), { user: f.users.OTHER })).status).toBe(404);
});
test('concurrent draft edits serialize one revision winner and rejected write leaves no receipt/event', async () => {
  const w = await create();
  const created = await f.http(`${path(w)}/scenarios`, { method: 'POST', body: draft() });
  const url = `${path(w)}/scenarios/${created.body.data.scenario_id}`;
  const responses = await Promise.all(['A', 'B'].map(name => f.http(url, { method: 'PATCH', body: { ...draft(), name, expected_revision: 1 } })));
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  const after = await f.http(url);
  expect(after.body.data.revision).toBe(2);
  const events = await db.$queryRaw`SELECT type FROM scenario_events WHERE workspace_id=${w.workspace_id}::uuid AND type='DRAFT_REVISED'`;
  expect(events).toHaveLength(1);
  const revisions = await db.$queryRaw`SELECT revision FROM scenario_draft_revisions WHERE scenario_id=${created.body.data.scenario_id}::uuid ORDER BY revision`;
  expect(revisions.map(r => r.revision)).toEqual([1, 2]);
});
test('pagination is complete without duplicates, cursor cannot move between actors or factories', async () => {
  for (let i = 0; i < 3; i++) await create(b);
  const base = `/scenario-workspaces?factory_id=${b.factory_id}&limit=1`;
  const ids = new Set();
  let cursor, firstCursor;
  do {
    const response = await f.http(base + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
    expect(response.status).toBe(200);
    for (const row of response.body.data.items) { expect(ids.has(row.workspace_id)).toBe(false); ids.add(row.workspace_id); }
    cursor = response.body.data.next_cursor;
    firstCursor ??= cursor;
  } while (cursor);
  const [{ count }] = await db.$queryRaw`SELECT count(*)::int AS count FROM scenario_workspaces WHERE factory_id=${b.factory_id}`;
  expect(ids.size).toBe(count);
  expect((await f.http(`${base}&cursor=${firstCursor}`, { user: f.users.MANAGER })).status).toBe(400);
  expect((await f.http(`/scenario-workspaces?factory_id=${a.factory_id}&cursor=${firstCursor}`)).status).toBe(400);
  expect((await f.http(`${base}&cursor=invalid`)).status).toBe(400);
});
test('reads do not modify snapshot/head/schedule and stale head creation fails atomically', async () => {
  const w = await create();
  const read = () => Promise.all([db.operationsHead.findUnique({ where: { factoryId: a.factory_id } }),
    db.factorySnapshot.findMany({ where: { factoryId: a.factory_id } }), db.operationSchedule.findMany({ where: { factoryId: a.factory_id } })]);
  const before = await read();
  await f.http(path(w)); await f.http(`/scenario-workspaces?factory_id=${a.factory_id}`);
  const body = await request(); body.expected_head.revision++;
  expect((await f.http('/scenario-workspaces', { method: 'POST', body })).status).toBe(409);
  expect(await read()).toEqual(before);
});
test('duplicate run enqueue is atomic and frozen revision survives draft edits', async () => {
  const w = await create();
  const created = await f.http(`${path(w)}/scenarios`, { method: 'POST', body: draft() });
  const d = created.body.data, key = randomUUID();
  const options = { method: 'POST', key, body: { kind: 'SCENARIO', scenario_id: d.scenario_id, expected_revision: 1 } };
  const responses = await Promise.all([f.http(`${path(w)}/runs`, options), f.http(`${path(w)}/runs`, options)]);
  expect(responses.map(r => r.status)).toEqual([202, 202]);
  expect(responses[0].body).toEqual(responses[1].body);
  const job = responses[0].body.data;
  expect(job.points).toHaveLength(2);
  expect(job.status).toBe('QUEUED');
  const [before] = await db.$queryRaw`SELECT input_json,input_hash FROM scenario_jobs WHERE id=${job.job_id}::uuid`;
  expect(before.input_json.overrides[0].expected_duration_minutes).toBe(90);
  const revised = { ...draft(), expected_revision: 1, overrides: [{ ...draft().overrides[0], expected_duration_minutes: 180 }] };
  expect((await f.http(`${path(w)}/scenarios/${d.scenario_id}`, { method: 'PATCH', body: revised })).status).toBe(200);
  expect((await f.http(`${path(w)}/runs`, { ...options, key: randomUUID() })).status).toBe(409);
  const [after] = await db.$queryRaw`SELECT input_json,input_hash FROM scenario_jobs WHERE id=${job.job_id}::uuid`;
  expect(after).toEqual(before);
  expect((await f.http(`${path(w)}/runs/${job.job_id}`, { user: f.users.VIEWER })).status).toBe(200);
  expect((await f.http(`${path(w)}/runs`, { method: 'POST', user: f.users.OPERATOR, body: { kind: 'BASELINE' } })).status).toBe(403);
  const foreign = await create(b);
  expect((await f.http(`${path(foreign)}/runs/${job.job_id}`)).status).toBe(404);
  const events = await db.$queryRaw`SELECT sequence FROM scenario_events WHERE job_id=${job.job_id}::uuid AND type='RUN_ENQUEUED'`;
  expect(events).toHaveLength(1);
});

test('worker leases serialize factory concurrency, reclaim frozen inputs and reject the old owner', async () => {
  const lease = require('../../src/services/scenario-lease.service');
  const oldEngine = process.env.SCENARIO_ENGINE_VERSION;
  process.env.SCENARIO_ENGINE_VERSION = 'lease-test-' + randomUUID();
  try {
    const w = await create();
    const queued = await f.http(`${path(w)}/runs`, { method: 'POST', body: { kind: 'BASELINE' } });
    expect(queued.status).toBe(202);
    const settings = { workerId: 'worker-a', engineVersion: process.env.SCENARIO_ENGINE_VERSION, contractVersion: 'storage-test', leaseMs: 30000 };
    const attempts = await Promise.all([lease.claimNext(db, settings), lease.claimNext(db, { ...settings, workerId: 'worker-b' })]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    const first = attempts.find(Boolean);
    const originalInput = first.input_json;
    // Expire this test-owned lease using DB clock; do not sleep or rewrite input/deadline.
    await db.$executeRaw`UPDATE scenario_jobs SET lease_expires_at=clock_timestamp()-interval '1 millisecond' WHERE id=${first.id}::uuid`;
    const next = await lease.claimNext(db, { ...settings, workerId: 'worker-after-restart', leaseMs: 30000 });
    expect(next.id).toBe(first.id);
    expect(next.attempt).toBe(2);
    expect(next.lease_token).not.toBe(first.lease_token);
    expect(next.input_json).toEqual(originalInput);
    expect(next.input_hash).toBe(first.input_hash);
    await expect(lease.heartbeat(db, first)).rejects.toMatchObject({ code: 'SCENARIO_LEASE_CONFLICT' });
    await expect(lease.fenced(db, first, tx => tx.$executeRaw`UPDATE scenario_points SET status='FAILED',error_code='LATE',completed_at=clock_timestamp() WHERE job_id=${first.id}::uuid`))
      .rejects.toMatchObject({ code: 'SCENARIO_LEASE_CONFLICT' });
    const points = await db.$queryRaw`SELECT status FROM scenario_points WHERE job_id=${first.id}::uuid`;
    expect(points.every(point => point.status === 'QUEUED')).toBe(true);
    const history = await db.$queryRaw`SELECT attempt,status FROM scenario_attempts WHERE job_id=${first.id}::uuid ORDER BY attempt`;
    expect(history).toEqual([{ attempt: 1, status: 'EXPIRED' }, { attempt: 2, status: 'RUNNING' }]);
    await lease.release(db, next);
    const third = await lease.claimNext(db, { ...settings, leaseMs: 30000 });
    expect(third.attempt).toBe(3);
    await lease.release(db, third);
    expect(await lease.claimNext(db, settings)).toBeNull();
    const read = await f.http(`${path(w)}/runs/${first.id}`);
    expect(read.body.data.status).toBe('FAILED');
    expect(read.body.data.error_code).toBe('SCENARIO_ATTEMPTS_EXHAUSTED');
  } finally { process.env.SCENARIO_ENGINE_VERSION = oldEngine; }
});
test('S1/P1 workspace and frozen publication remain historical after ingesting S2', async () => {
  const source = await f.factory();
  const published = await f.publish(source);
  const w = await create(source);
  expect(w.baseline.publication.schedule_id).toBe(published.candidate.schedule.schedule_id);
  const queued = await f.http(`${path(w)}/runs`, { method: 'POST', body: { kind: 'BASELINE' } });
  expect(queued.status).toBe(202);
  const [input] = await db.$queryRaw`SELECT input_json,input_hash FROM scenario_jobs WHERE id=${queued.body.data.job_id}::uuid`;
  expect(input.input_json.reference_publication).toEqual(published.candidate.schedule);
  const head = await db.operationsHead.findUnique({ where: { factoryId: source.factory_id } });
  const observed = structuredClone(source);
  observed.snapshot_id = 'scenario-S2-' + randomUUID();
  observed.captured_at = new Date(Date.parse(source.captured_at) + 60000).toISOString();
  observed.current_schedule = structuredClone(published.candidate.schedule);
  await require('../../src/services/operations-snapshot.service').ingestFactorySnapshot({ factoryId: source.factory_id,
    expectedHeadRevision: head.revision, snapshot: observed, sourceId: 'scenario-history-test' }, db);
  const historical = await f.http(path(w));
  expect(historical.body.data.stale).toBe(true);
  expect(historical.body.data.baseline.snapshot_id).toBe(source.snapshot_id);
  expect(historical.body.data.current_head.snapshot_id).toBe(observed.snapshot_id);
  const again = await f.http(`${path(w)}/runs`, { method: 'POST', body: { kind: 'BASELINE' } });
  expect(again.status).toBe(202);
  const [second] = await db.$queryRaw`SELECT input_json,input_hash FROM scenario_jobs WHERE id=${again.body.data.job_id}::uuid`;
  expect(second).toEqual(input);
  const currentWorkspace = await create(observed);
  expect(currentWorkspace.baseline.snapshot_id).toBe(observed.snapshot_id);
  expect(currentWorkspace.baseline.publication.schedule_id).toBe(w.baseline.publication.schedule_id);
});
