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
