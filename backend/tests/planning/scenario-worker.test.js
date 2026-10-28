const { randomUUID } = require('node:crypto');
const db = require('../../src/config/prisma');
const app = require('../../src/app');
const { fixture } = require('../helpers/work-order-fixtures');
const { ScenarioWorker } = require('../../src/scenario-worker/worker');
const { ScenarioEngineClient } = require('../../src/services/scenario-engine.client');
const lease = require('../../src/services/scenario-lease.service');
const { requestForJob } = require('../../src/services/scenario-engine.adapter');
const example = require('../../../contracts/v3/examples/demo-scenario.json');
const { DecisionCaseWorker } = require('../../src/decision-worker/decision-case-worker');
const { OperationsPlanningClient } = require('../../src/services/operations-planning.client');
let f, snapshot, workspace;
const worker = () => new ScenarioWorker({ db, client: new ScenarioEngineClient() });
const url = suffix => `/scenario-workspaces/${workspace.workspace_id}${suffix}`;

beforeAll(async () => {
  process.env.FACTORY_ACCESS_SOURCE = 'database';
  process.env.SCENARIO_ENGINE_VERSION = 'scenario-evaluator:1.0.0';
  process.env.SCENARIO_CONTRACT_VERSION = 'scenario-engine:1.0';
  process.env.SCENARIO_SAMPLING_VERSION = 'scenario-crn:1';
  f = await fixture(db, app);
  snapshot = await f.factory();
  const head = await db.operationsHead.findUnique({ where: { factoryId: snapshot.factory_id } });
  const response = await f.http('/scenario-workspaces', { method: 'POST', body: {
    factory_id: snapshot.factory_id, name: 'Real Scenario integration',
    expected_head: { snapshot_id: head.snapshotId, plan_version: head.planVersion, revision: head.revision },
    planning_config: { ...example.planning_config, horizon_minutes: (Date.parse(snapshot.planning_window.end_at) - Date.parse(snapshot.planning_window.start_at)) / 60000,
      allowed_strategy_ids: ['PRODUCTION_PRIORITY', 'BALANCED', 'RELIABILITY_PRIORITY'] } } });
  expect(response.status).toBe(201);
  workspace = response.body.data;
}, 60000);
afterAll(async () => { if (f) await f.close(); await db.$disconnect(); });

async function enqueue(overrides = []) {
  const draft = await f.http(url('/scenarios'), { method: 'POST', body: { name: 'Draft', note: '',
    overrides, objective_weights: example.planning_config.objective_weights } });
  expect(draft.status).toBe(201);
  const queued = await f.http(url('/runs'), { method: 'POST', body: { kind: 'SCENARIO',
    scenario_id: draft.body.data.scenario_id, expected_revision: 1 } });
  expect(queued.status).toBe(202);
  return queued.body.data;
}
async function read(job, kind = 'runs') {
  const response = await f.http(url(`/${kind}/${job.job_id}`));
  expect(response.status).toBe(200);
  return response.body.data;
}
const claim = () => lease.claimNext(db, { workerId: 'crash-test', engineVersion: 'scenario-evaluator:1.0.0', contractVersion: 'scenario-engine:1.0', leaseMs: 1000 });

test('real seeded snapshot -> HTTP run -> worker -> FastAPI -> fenced result, replay and unchanged LIVE head', async () => {
  const before = await db.operationsHead.findUnique({ where: { factoryId: snapshot.factory_id } });
  const first = await enqueue();
  expect((await worker().runOnce()).outcome).toBe('completed');
  const saved = await read(first);
  expect(saved.status).toBe('SUCCEEDED');
  expect(saved.result.baseline.outcome).toBe('FEASIBLE');
  expect(saved.result.scenario).toEqual(saved.result.baseline);
  expect(saved.points).toHaveLength(2);
  expect(saved.points.every(p => p.status === 'FEASIBLE')).toBe(true);
  const second = await enqueue();
  await worker().runOnce();
  const replay = await read(second);
  expect(replay.result.scenario).toEqual(saved.result.scenario);
  expect(replay.result.semantic_input_hash).toBe(saved.result.semantic_input_hash);
  expect(await db.operationsHead.findUnique({ where: { factoryId: snapshot.factory_id } })).toEqual(before);
  const comparison = await f.http(url(`/compare?run_ids=${first.job_id},${second.job_id}`));
  expect(comparison.status).toBe(200);
  expect(comparison.body.data.score_comparison).toBe('NOT_COMPARABLE_ACROSS_REFERENCES');
  for (const axis of [
    { type: 'MAINTENANCE_DURATION', maintenance_request_id: snapshot.maintenance_requests[0].maintenance_request_id, values: [30, 60, 90, 120, 180] },
    { type: 'OBJECTIVE_WEIGHT', weight: 'production', values: [0, .5, 1, 2, 4] },
  ]) {
    const queued = await f.http(url('/sensitivity-jobs'), { method: 'POST', body: { source_run_id: first.job_id, axis } });
    expect(queued.status).toBe(202);
    expect((await worker().runOnce()).outcome).toBe('completed');
    const sweep = await read(queued.body.data, 'sensitivity-jobs');
    expect(sweep.status).toBe('SUCCEEDED');
    expect(sweep.points).toHaveLength(5);
    expect(sweep.result.outcome).toBe('COMPLETE');
    if (axis.type === 'OBJECTIVE_WEIGHT') expect(sweep.result.points.every(p => JSON.stringify(p.evaluation.candidates) === JSON.stringify(saved.result.scenario.candidates))).toBe(true);
  }
}, 120000);

test('duplicate workers claim only once; expired lease is reclaimed and old result is fenced', async () => {
  const queued = await enqueue();
  const claims = await Promise.all([claim(), claim()]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const old = claims.find(Boolean);
  const result = await new ScenarioEngineClient().execute(requestForJob(old, 10000));
  // Wait for the real short lease to expire; no historical input is edited.
  await new Promise(resolve => setTimeout(resolve, Math.max(0, old.lease_expires_at - Date.now()) + 50));
  const resumed = await worker().runOnce();
  expect(resumed.outcome).toBe('completed');
  await expect(lease.persist(db, old, result)).rejects.toMatchObject({ code: 'SCENARIO_LEASE_CONFLICT' });
  expect((await read(queued)).attempt).toBe(2);
  const attempts = await db.$queryRaw`SELECT status FROM scenario_attempts WHERE job_id=${queued.job_id}::uuid ORDER BY attempt`;
  expect(attempts.map(a => a.status)).toEqual(['EXPIRED', 'SUCCEEDED']);
}, 30000);

test('saved typed defer handoff creates a fresh LIVE case and real recommendation with the bound preserved', async () => {
  const target = snapshot.maintenance_requests[0];
  const earliest = new Date(Date.parse(target.earliest_start_at) + 15 * 60000).toISOString();
  const source = await enqueue([{ type: 'DEFER_MAINTENANCE', maintenance_request_id: target.maintenance_request_id, earliest_start_at: earliest }]);
  expect((await worker().runOnce()).outcome).toBe('completed');
  const saved = await read(source);
  expect(saved.result.live_mapping.supported).toBe(true);
  const head = await db.operationsHead.findUnique({ where: { factoryId: snapshot.factory_id } });
  const body = { source_run_id: source.job_id, confirmation: true, expected_head: { snapshot_id: head.snapshotId, plan_version: head.planVersion, revision: head.revision } };
  const key = randomUUID();
  const response = await f.http(url('/live-evaluations'), { method: 'POST', key, body });
  expect(response.status).toBe(201);
  const id = response.body.data.decision_case_id;
  expect((await f.http(url('/live-evaluations'), { method: 'POST', key, body })).body).toEqual(response.body);
  const caseWorker = new DecisionCaseWorker({ db, planningClient: new OperationsPlanningClient() });
  expect((await caseWorker.runOnce()).outcome).toBe('completed');
  const recommendation = await f.http(`/decision-cases/${id}/recommendation`);
  expect(recommendation.status).toBe(200);
  const candidates = recommendation.body.data.recommendation.candidate_plans;
  for (const candidate of candidates) {
    expect(candidate.decision_case_id).toBe(id);
    const assignment = candidate.schedule.assignments.find(a => a.maintenance_request_id === target.maintenance_request_id);
    expect(Date.parse(assignment.start_at)).toBeGreaterThanOrEqual(Date.parse(earliest));
  }
  expect(await db.operationsHead.findUnique({ where: { factoryId: snapshot.factory_id } })).toEqual(head);
}, 60000);

test('invalid responses fail safely; transport retries use same frozen input; cancellation releases lease', async () => {
  const invalid = await enqueue();
  const bad = new ScenarioWorker({ db, client: { execute: async () => ({ invented: true }) } });
  expect((await bad.runOnce()).outcome).toBe('failed');
  expect((await read(invalid)).error_code).toBe('INVALID_SCENARIO_RESPONSE');
  const retry = await enqueue();
  const transient = new ScenarioWorker({ db, client: { execute: async () => { throw Object.assign(new Error(), { code: 'SCENARIO_UNAVAILABLE', retryable: true }); } } });
  await transient.runOnce();
  expect((await read(retry)).status).toBe('QUEUED');
  await worker().runOnce();
  expect((await read(retry)).status).toBe('SUCCEEDED');
  const interrupted = await enqueue();
  const controller = new AbortController();
  const cancelled = new ScenarioWorker({ db, client: { execute: async () => { controller.abort(); throw controller.signal.reason; } } });
  expect((await cancelled.runOnce({ signal: controller.signal })).outcome).toBe('released');
  expect((await read(interrupted)).status).toBe('QUEUED');
  await worker().runOnce();
  expect((await read(interrupted)).status).toBe('SUCCEEDED');
}, 60000);
