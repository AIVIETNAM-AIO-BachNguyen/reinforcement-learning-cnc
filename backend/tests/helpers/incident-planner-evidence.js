const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

// Fresh schemas generate new case IDs. Those IDs seed the Monte Carlo results,
// so ranking/estimated reliability are not comparable across different cases.
// Compare every strategy's deterministic schedule, not only the ranked winner.
function candidateScheduleFingerprint(recommendation) {
  assert.ok(recommendation.candidate_plans?.length, 'Expected real planner candidates');
  const candidates = recommendation.candidate_plans.map(candidate => ({
    strategy: candidate.strategy,
    plan_version: candidate.plan_version,
    validation_verdict: candidate.validation.verdict,
    assignments: candidate.schedule.assignments.map(assignment => Object.fromEntries([
      'assignment_type', 'machine_id', 'job_id', 'operation_id', 'maintenance_request_id',
      'technician_ids', 'start_at', 'end_at', 'status', 'locked',
    ].map(key => [key, assignment[key]]))),
  })).sort((a, b) => String(a.strategy).localeCompare(String(b.strategy)));
  assert.equal(new Set(candidates.map(candidate => candidate.strategy)).size, candidates.length);
  return createHash('sha256').update(JSON.stringify(candidates)).digest('hex');
}

async function verifyPlannerReplay({ aiUrl, caseId, storedRecommendation }) {
  const recorded = await fetch(`${aiUrl}/test/requests`, { signal: AbortSignal.timeout(10000) });
  assert.equal(recorded.status, 200, 'Recorded worker request unavailable');
  const requests = (await recorded.json()).filter(item => item.path === '/v1/operations/plan'
    && item.body.decision_case_id === caseId);
  assert.ok(requests.length, 'No real worker request recorded for the linked case');
  assert.equal(storedRecommendation.decision_case_id, caseId);
  const response = await fetch(`${aiUrl}/v1/operations/plan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requests[0].body), signal: AbortSignal.timeout(90000),
  });
  assert.equal(response.status, 200, 'Same-input planner replay failed');
  // Preserve all IDs, selected candidate, risk estimates, scores and timestamps
  // for this comparison. Normalization must not conceal nondeterministic replay.
  assert.deepStrictEqual(await response.json(), storedRecommendation,
    'Exact worker request must reproduce the complete persisted recommendation');
  return {
    exact_request_replay: 'passed',
    candidate_schedule_fingerprint: candidateScheduleFingerprint(storedRecommendation),
    selected_candidate_id: storedRecommendation.recommended_plan_id,
  };
}

module.exports = { candidateScheduleFingerprint, verifyPlannerReplay };
