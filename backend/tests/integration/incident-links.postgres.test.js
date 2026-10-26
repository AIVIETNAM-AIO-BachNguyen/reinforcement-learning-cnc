const { randomUUID } = require('node:crypto');
const db = require('../../src/config/prisma');
const app = require('../../src/app');
const { fixture } = require('../helpers/work-order-fixtures');
let f;
const oldMode = process.env.FACTORY_ACCESS_SOURCE;
beforeAll(async () => { process.env.FACTORY_ACCESS_SOURCE = 'database'; f = await fixture(db, app); }, 30000);
afterAll(async () => {
  await f?.close(); await db.$disconnect();
  if (oldMode === undefined) delete process.env.FACTORY_ACCESS_SOURCE; else process.env.FACTORY_ACCESS_SOURCE = oldMode;
});
const data = r => { expect(r.status).toBe(200); return r.body.data; };
const command = (row, command, fields = {}, user = f.users.MANAGER, key = randomUUID()) =>
  f.http('/incidents/' + row.id + '/commands', { method: 'POST', user, key,
    body: { command, expected_revision: row.revision, ...fields } });
async function setup() {
  // Contract-shaped recommendation here tests transactional producer integration;
  // real planner evidence is supplied separately by the Chromium suite.
  const publication = await f.publish(await f.factory());
  const createdOrder = await f.create(publication); expect(createdOrder.status).toBe(201);
  const created = await f.http('/incidents', { method: 'POST', body: {
    factory_id: publication.body.factory_id, source: { type: 'manual', source_event_id: randomUUID() },
    title: 'Linked verification', description: 'Human inspection', category: 'EQUIPMENT', severity: 'WARNING',
    machine: { machine_id: createdOrder.body.data.machine_id, basis_snapshot_id: publication.snapshot.snapshot_id },
  } });
  expect(created.status).toBe(201);
  let row = created.body.data.incident;
  row = data(await command(row, 'ASSIGN', { owner_user_id: f.users.MANAGER.id })).incident;
  row = data(await command(row, 'ACKNOWLEDGE')).incident;
  row = data(await command(row, 'START_INVESTIGATION')).incident;
  return { row, order: createdOrder.body.data, publication };
}
const link = (row, target, key = randomUUID()) => f.http('/incidents/' + row.id + '/links',
  { method: 'POST', key, body: { expected_revision: row.revision, target } });
const resolution = { code: 'FIXED', summary: 'Reviewed', evidence: 'Recorded inspection' };

test('linked order survives both access-loss recoveries, S2/P2, reopen and independent API restarts', async () => {
  const { startApi } = require('../helpers/work-order-process-client');
  const { ingestFactorySnapshot } = require('../../src/services/operations-snapshot.service');
  let { row, order, publication } = await setup();
  row = data(await link(row, { type: 'work_order', id: order.id })).incident;
  row = data(await link(row, { type: 'case', id: publication.id })).incident;
  const source = order.source;
  const execute = async (name, fields = {}, actor = f.users.OPERATOR) => {
    order = data(await f.command(order, name, fields, actor));
  };
  await execute('ASSIGN', { assignee_user_id: f.users.OPERATOR.id }, f.users.MANAGER);
  await execute('ACCEPT');
  await execute('START');
  const started = order.actual_started_at;
  await execute('BLOCK', { reason: 'Inspection material unavailable' });
  await execute('RESUME', { reason: 'Material received' });
  expect((await f.member(publication.body.factory_id, f.users.OPERATOR, 'DELETE')).status).toBe(200);
  expect((await f.command(order, 'COMPLETE', { report: { outcome: 'SUCCESS', work_performed: 'Denied', result: 'Denied' } })).status).toBe(404);
  await execute('MANAGER_HOLD', { reason: 'Assignee access revoked during execution' }, f.users.MANAGER);
  await execute('REASSIGN', { assignee_user_id: f.users.OTHER.id, reason: 'Eligible replacement' }, f.users.MANAGER);
  await execute('ACCEPT', {}, f.users.OTHER);
  await execute('START', {}, f.users.OTHER);
  expect(order.actual_started_at).toBe(started);
  await execute('COMPLETE', { report: { outcome: 'PARTIAL', work_performed: 'First inspection', result: 'Further work required' } }, f.users.OTHER);
  const firstCompletion = await db.workOrderCompletion.findFirstOrThrow({ where: { workOrderId: order.id, attempt: 1 } });
  expect((await f.member(publication.body.factory_id, f.users.OTHER, 'DELETE')).status).toBe(200);
  expect((await f.member(publication.body.factory_id, f.users.OUTSIDER)).status).toBe(200);
  await execute('REASSIGN_FOR_REWORK', { assignee_user_id: f.users.OUTSIDER.id, reason: 'Independent review requires rework by eligible replacement' }, f.users.MANAGER);
  expect(order).toMatchObject({ status: 'ASSIGNED', attempt: 2, actual_started_at: started });
  expect(await db.workOrderCompletion.findUnique({ where: { id: firstCompletion.id } })).toEqual(firstCompletion);
  for (const user of [f.users.OPERATOR, f.users.OTHER]) {
    expect((await db.factoryMembership.findUnique({ where: { factoryId_userId: { factoryId: publication.body.factory_id, userId: user.id } } })).active).toBe(false);
    expect((await f.http('/work-orders/' + order.id, { user })).status).toBe(404);
  }
  await execute('ACCEPT', {}, f.users.OUTSIDER);
  await execute('START', {}, f.users.OUTSIDER);
  await execute('COMPLETE', { report: { outcome: 'SUCCESS', work_performed: 'Replacement inspection', result: 'Ready for independent verification' } }, f.users.OUTSIDER);
  expect((await command(row, 'MARK_RESOLVED', { resolution })).body.error.code).toBe('INCIDENT_WORK_ORDER_ACTIVE');
  await execute('CLOSE', { verification: { result: 'VERIFIED', note: 'Independent verification after rework' } }, f.users.MANAGER);
  expect(data(await f.http('/incidents/' + row.id)).incident.status).toBe('INVESTIGATING');

  const head = await db.operationsHead.findUnique({ where: { factoryId: publication.body.factory_id } });
  const s2 = { ...structuredClone(publication.snapshot), snapshot_id: 'linked-recovery-S2-' + randomUUID() };
  await ingestFactorySnapshot({ factoryId: s2.factory_id, expectedHeadRevision: head.revision, snapshot: s2, sourceId: 'linked-recovery-upgrade' }, db);
  await f.publish(s2);
  const headAfterP2 = await db.operationsHead.findUnique({ where: { factoryId: s2.factory_id } });
  const snapshotsAfterP2 = await db.factorySnapshot.findMany({ where: { factoryId: s2.factory_id }, orderBy: { snapshotId: 'asc' } });
  expect(data(await f.http('/work-orders/' + order.id))).toMatchObject({ source, source_is_current: false });
  row = data(await command(row, 'MARK_RESOLVED', { resolution })).incident;
  row = data(await command(row, 'CLOSE', { verification: { resolution_code: 'FIXED', note: 'Independent incident verification' } }, f.users.ADMIN)).incident;
  const closed = data(await f.http('/incidents/' + row.id));
  row = data(await command(row, 'REOPEN', { reason: 'A new human observation needs investigation' }, f.users.ADMIN)).incident;
  const paths = ['/incidents/' + row.id, '/incidents/' + row.id + '/events', '/incidents/' + row.id + '/occurrences', '/work-orders/' + order.id, '/work-orders/' + order.id + '/events'];
  const expected = await Promise.all(paths.map(async path => data(await f.http(path))));
  // Reports live at the detail root, not inside the incident summary.
  const expectRetainedReports = (actual) => {
    expect(closed.resolution).toEqual(expect.objectContaining({
      actor_id: f.users.MANAGER.id, report: resolution,
    }));
    expect(closed.closure).toEqual(expect.objectContaining({
      actor_id: f.users.ADMIN.id,
      verification: { resolution_code: 'FIXED', note: 'Independent incident verification' },
    }));
    expect(actual.resolution).toEqual(closed.resolution);
    expect(actual.closure).toEqual(closed.closure);
  };
  expectRetainedReports(expected[0]);
  // Prove these assertions detect missing reports and altered verification.
  expect(() => expectRetainedReports({ ...expected[0], resolution: null })).toThrow();
  expect(() => expectRetainedReports({ ...expected[0], closure: null })).toThrow();
  expect(() => expectRetainedReports({
    ...expected[0], closure: { ...expected[0].closure, actor_id: f.users.MANAGER.id },
  })).toThrow();
  expect(expected[0].work_orders[0]).toMatchObject({ id: order.id, status: 'CLOSED', source_is_current: false });
  for (let restart = 0; restart < 2; restart++) {
    const api = await startApi();
    try {
      for (let i = 0; i < paths.length; i++) {
        const response = await api.http(paths[i], f.users.ADMIN);
        expect(response.status).toBe(200);
        expect(response.cache).toBe('no-store');
        expect(response.body.data).toEqual(expected[i]);
        if (i === 0) expectRetainedReports(response.body.data);
      }
      expect((await api.http('/incidents/' + row.id, f.users.OPERATOR)).status).toBe(404);
    } finally { await api.stop(); }
  }
  expect(await db.operationsHead.findUnique({ where: { factoryId: s2.factory_id } })).toEqual(headAfterP2);
  expect(await db.factorySnapshot.findMany({ where: { factoryId: s2.factory_id }, orderBy: { snapshotId: 'asc' } })).toEqual(snapshotsAfterP2);
  expect(await db.workOrderCompletion.count({ where: { workOrderId: order.id } })).toBe(2);
  expect(await db.workOrderCompletion.findUnique({ where: { id: firstCompletion.id } })).toEqual(firstCompletion);
}, 90000);

test('real Work Order overrides are explicit and audited; unlink keeps history and never changes producer state', async () => {
  let { row, order } = await setup();
  const target = { type: 'work_order', id: order.id };
  let response = data(await link(row, target)); row = response.incident;
  expect(response.work_orders[0]).toMatchObject({ id: order.id, status: 'UNASSIGNED' });
  const before = await db.workOrder.findUnique({ where: { id: order.id } });
  expect(await command(row, 'MARK_RESOLVED', { resolution })).toMatchObject({ status: 409, body: { error: { code: 'INCIDENT_WORK_ORDER_ACTIVE' } } });
  row = data(await command(row, 'MARK_RESOLVED', { resolution, work_order_override_reason: 'Manager accepts documented nonterminal risk' })).incident;
  expect(await command(row, 'CLOSE', { verification: { resolution_code: 'FIXED', note: 'Independent review' } }, f.users.ADMIN))
    .toMatchObject({ status: 409, body: { error: { code: 'INCIDENT_WORK_ORDER_ACTIVE' } } });
  row = data(await command(row, 'CLOSE', { verification: { resolution_code: 'FIXED', note: 'Independent review' },
    work_order_override_reason: 'Independent manager authorizes closure with order still active' }, f.users.ADMIN)).incident;
  expect(row.status).toBe('CLOSED');
  const events = data(await f.http('/incidents/' + row.id + '/events'));
  expect(events.find(e => e.command === 'MARK_RESOLVED').payload.work_order_override_reason).toBeTruthy();
  expect(events.find(e => e.command === 'CLOSE').payload.work_order_override_reason).toBeTruthy();
  const linkId = response.links[0].id;
  response = data(await f.http('/incidents/' + row.id + '/links/' + linkId, { method: 'DELETE',
    body: { expected_revision: row.revision, reason: 'Association no longer required; retain audit' } }));
  expect(response.links).toHaveLength(0);
  const retained = await db.incidentWorkOrderLink.findUnique({ where: { id: linkId } });
  expect(retained.removalReason).toBe('Association no longer required; retain audit');
  expect(retained.removedAt).toBeInstanceOf(Date);
  expect(await db.workOrder.findUnique({ where: { id: order.id } })).toEqual(before);
}, 60000);

test('duplicate/concurrent links have one winner and cross-factory targets fail closed', async () => {
  let { row, order, publication } = await setup();
  const responses = await Promise.all([link(row, { type: 'work_order', id: order.id }), link(row, { type: 'work_order', id: order.id })]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  row = responses.find(r => r.status === 200).body.data.incident;
  const eventCount = await db.incidentEvent.count({ where: { incidentId: row.id } });
  const duplicate = data(await link(row, { type: 'work_order', id: order.id }));
  expect(duplicate.incident.revision).toBe(row.revision);
  expect(await db.incidentEvent.count({ where: { incidentId: row.id } })).toBe(eventCount);
  expect(await db.incidentWorkOrderLink.count({ where: { incidentId: row.id } })).toBe(1);
  const foreign = await f.publish(await f.factory());
  const foreignOrder = await f.create(foreign); expect(foreignOrder.status).toBe(201);
  expect(await link(row, { type: 'work_order', id: foreignOrder.body.data.id })).toMatchObject({ status: 503 });
  expect(await link(row, { type: 'case', id: foreign.id })).toMatchObject({ status: 404 });
  // Generic manual-replan cases have no trusted trigger machine: label case scope.
  const caseLink = data(await link(row, { type: 'case', id: publication.id }));
  expect(caseLink.links.find(l => l.type === 'case').association_scope).toBe('case');
}, 60000);

test('missing linked target cannot be bypassed with a manager override', async () => {
  let { row } = await setup();
  // Deliberately simulate a producer record absent from an already persisted link.
  await db.incidentWorkOrderLink.create({ data: { incidentId: row.id, targetId: randomUUID(),
    associationScope: 'machine', createdBy: f.users.ADMIN.id } });
  const response = await command(row, 'MARK_RESOLVED', { resolution, work_order_override_reason: 'Must not bypass missing target' });
  expect(response).toMatchObject({ status: 503, body: { error: { code: 'INCIDENT_LINK_TARGET_UNAVAILABLE' } } });
  const read = data(await f.http('/incidents/' + row.id));
  expect(read.incident.revision).toBe(row.revision);
  expect(read.links[0].availability).toBe('unavailable');
  expect(read.work_orders).toEqual([]);
}, 60000);

test('linked resolution and producer cancellation serialize against the same factory boundary', async () => {
  let { row, order, publication } = await setup();
  row = data(await link(row, { type: 'work_order', id: order.id })).incident;
  let attempts;
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${publication.body.factory_id}, 0))::text`;
    attempts = [command(row, 'MARK_RESOLVED', { resolution }),
      f.command(order, 'CANCEL', { reason: 'Maintenance no longer required after independent inspection' }, f.users.MANAGER)];
    // Observe both real HTTP transactions waiting before releasing the barrier.
    const deadline = Date.now() + 10000;
    let waiting = 0;
    while (Date.now() < deadline) {
      const locks = await tx.$queryRaw`SELECT count(*)::int AS count FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`;
      waiting = locks[0].count;
      if (waiting >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(waiting).toBeGreaterThanOrEqual(2);
  }, { timeout: 15000 });
  const [resolved, cancelled] = await Promise.all(attempts);
  expect(cancelled.status).toBe(200);
  expect(cancelled.body.data.status).toBe('CANCELLED');
  // Either serial order is legal; a blocked resolution must leave no effects.
  expect([200, 409]).toContain(resolved.status);
  if (resolved.status === 409) {
    expect(resolved.body.error.code).toBe('INCIDENT_WORK_ORDER_ACTIVE');
    expect(data(await f.http('/incidents/' + row.id)).incident.revision).toBe(row.revision);
    row = data(await command(row, 'MARK_RESOLVED', { resolution })).incident;
  } else row = resolved.body.data.incident;
  expect(row.status).toBe('RESOLVED');
  expect(await db.incidentEvent.count({ where: { incidentId: row.id, command: 'MARK_RESOLVED' } })).toBe(1);
  expect((await db.workOrder.findUnique({ where: { id: order.id } })).status).toBe('CANCELLED');
}, 60000);
