const { candidateScheduleFingerprint, verifyPlannerReplay } = require('./helpers/incident-planner-evidence');

const recommendation = () => ({
  decision_case_id: 'case-1', recommended_plan_id: 'plan-1',
  candidate_plans: ['BALANCED', 'RELIABILITY_PRIORITY'].map((strategy, index) => ({
    candidate_plan_id: `plan-${index + 1}`, strategy, plan_version: 2,
    validation: { verdict: 'VALID' }, kpis: { failure_probability: 0.1 },
    schedule: { schedule_id: `schedule-${index}`, assignments: [{
      assignment_id: `assignment-${index}`, assignment_type: 'MAINTENANCE', machine_id: 'M03',
      maintenance_request_id: 'MR03', technician_ids: ['T01'], start_at: '2026-09-22T00:00:00Z',
      end_at: '2026-09-22T01:00:00Z', status: 'PLANNED', locked: false,
    }] },
  })),
});

test('cross-case fingerprint compares every schedule independently of case-scoped ranking and IDs', () => {
  const first = recommendation(), second = JSON.parse(JSON.stringify(first));
  second.decision_case_id = 'case-2';
  second.recommended_plan_id = 'other-plan';
  second.candidate_plans.reverse();
  for (const candidate of second.candidate_plans) {
    candidate.candidate_plan_id = `other-${candidate.strategy}`;
    candidate.kpis.failure_probability = 0.2;
    candidate.schedule.schedule_id = `other-${candidate.strategy}`;
    candidate.schedule.assignments[0].assignment_id = `other-${candidate.strategy}`;
  }
  expect(candidateScheduleFingerprint(second)).toBe(candidateScheduleFingerprint(first));
  second.candidate_plans[0].schedule.assignments[0].technician_ids = ['T02'];
  expect(candidateScheduleFingerprint(second)).not.toBe(candidateScheduleFingerprint(first));
  expect(candidateScheduleFingerprint({ ...first, candidate_plans: first.candidate_plans.slice(0, 1) }))
    .not.toBe(candidateScheduleFingerprint(first));
});

test('same-input replay compares the entire real response, including stochastic scores and recommended ID', async () => {
  const originalFetch = global.fetch;
  const stored = recommendation();
  const body = { decision_case_id: 'case-1', factory_snapshot: { snapshot_id: 'S1' } };
  let response = JSON.parse(JSON.stringify(stored));
  global.fetch = jest.fn(async (url, options) => {
    if (url.endsWith('/test/requests')) return { status: 200, json: async () => [{ path: '/v1/operations/plan', body }] };
    expect(JSON.parse(options.body)).toEqual(body);
    return { status: 200, json: async () => response };
  });
  try {
    const input = { aiUrl: 'http://127.0.0.1:1234', caseId: 'case-1', storedRecommendation: stored };
    expect((await verifyPlannerReplay(input)).exact_request_replay).toBe('passed');
    response.candidate_plans[0].kpis.failure_probability = 0.2;
    await expect(verifyPlannerReplay(input)).rejects.toThrow('complete persisted recommendation');
    response = { ...JSON.parse(JSON.stringify(stored)), recommended_plan_id: 'plan-2' };
    await expect(verifyPlannerReplay(input)).rejects.toThrow('complete persisted recommendation');
  } finally { global.fetch = originalFetch; }
});
