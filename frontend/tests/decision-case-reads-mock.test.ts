// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMockOperationsApiClient } from "@/lib/operations-api/mock";
import type { OperationsCreateDecisionCaseRequest, OperationsDecisionCommand } from "@/lib/operations-api/client";

describe("preview discovery and audit contract parity", () => {
  it("scopes cursors, paginates without gaps, applies AND filters, and never changes cases on list/events reads", async () => {
    const api = createMockOperationsApiClient();
    const context = await api.getOperationsSnapshot("factory-demo-01");
    const body: OperationsCreateDecisionCaseRequest = { schema_version: "3.0", factory_id: context.factory_id,
      expected_snapshot_id: context.snapshot_id, expected_plan_version: context.plan_version,
      request: { mode: "LIVE", trigger: { type: "MANUAL_REPLAN", reason: "Preview" }, planning_config: { horizon_minutes: 720 } } };
    const ids = [];
    for (let index = 0; index < 3; index++) ids.push((await api.createDecisionCase(body, { idempotencyKey: `create-${index}` })).caseStatus.decision_case_id);
    const first = await api.listDecisionCases({ factory_id: context.factory_id, status: "CREATED", mode: "LIVE", limit: 2 });
    const second = await api.listDecisionCases({ factory_id: context.factory_id, status: "CREATED", mode: "LIVE", cursor: first.meta.next_cursor!, limit: 2 });
    expect(new Set([...first.data, ...second.data].map(item => item.decision_case_id))).toEqual(new Set(ids));
    expect(second.meta).toMatchObject({ has_more: false, next_cursor: null });
    await expect(api.listDecisionCases({ factory_id: context.factory_id, mode: "SIMULATION_ONLY", cursor: first.meta.next_cursor! })).rejects.toMatchObject({ status: 400 });
    const empty = await api.listDecisionCases({ factory_id: context.factory_id, status: "APPROVED", mode: "LIVE" });
    expect(empty.data).toEqual([]);
    expect((await api.listEvents(ids[0])).data).toHaveLength(1);
    expect((await api.listDecisionCases({ factory_id: context.factory_id })).data.every(item => item.status === "CREATED")).toBe(true);
  });
  it("records public approval/commit metadata once and keeps event sequences distinct from candidate/head versions", async () => {
    const api = createMockOperationsApiClient();
    const context = await api.getOperationsSnapshot("factory-demo-01");
    const body: OperationsCreateDecisionCaseRequest = { schema_version: "3.0", factory_id: context.factory_id,
      expected_snapshot_id: context.snapshot_id, expected_plan_version: context.plan_version,
      request: { mode: "LIVE", trigger: { type: "MANUAL_REPLAN", reason: "Preview" }, planning_config: { horizon_minutes: 720 } } };
    const created = await api.createDecisionCase(body, { idempotencyKey: "create" });
    const id = created.caseStatus.decision_case_id;
    await api.getDecisionCase(id);
    const ready = await api.getDecisionCase(id);
    const candidate = (await api.getDecisionCaseRecommendation(id)).recommendation.candidate_plans[0];
    const approval: OperationsDecisionCommand = { schema_version: "3.0", decision_case_id: id,
      recommendation_id: ready.caseStatus.recommendation_id!, expected_snapshot_id: context.snapshot_id,
      expected_plan_version: context.plan_version, expected_case_revision: ready.meta!.case_revision,
      command: "APPROVE", candidate_plan_id: candidate.candidate_plan_id, candidate_version: candidate.plan_version };
    const approved = await api.submitDecisionCommand(id, approval, { idempotencyKey: "approve" });
    const commit: OperationsDecisionCommand = { ...approval, command: "COMMIT", expected_case_revision: approved.meta!.case_revision };
    await api.submitDecisionCommand(id, commit, { idempotencyKey: "commit" });
    await api.submitDecisionCommand(id, commit, { idempotencyKey: "commit" });
    await api.createDecisionCase(body, { idempotencyKey: "create" });
    const events = await api.listEvents(id, 0, { limit: 2 });
    expect(events.meta).toEqual({ has_more: true, next_after_sequence: 2 });
    const next = await api.listEvents(id, events.meta.next_after_sequence, { limit: 2 });
    expect(next.data.map(event => event.payload.command)).toEqual(["APPROVE", "COMMIT"]);
    expect(next.data[1].payload).toMatchObject({ candidate_plan_id: candidate.candidate_plan_id, candidate_version: candidate.plan_version, plan_version: context.plan_version + 1 });
    expect(next.data).toHaveLength(2);
    const listed = await api.listDecisionCases({ factory_id: context.factory_id, status: "COMMITTED" });
    expect(listed.data[0].publication?.schedule_id).toBe(candidate.schedule.schedule_id);
    expect(listed.data[0].stale).toBe(true);
  });
});
