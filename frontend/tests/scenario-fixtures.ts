// Contract/component evidence only. Never imported by production components.
import { createOperationsDemoFixtures } from "@/lib/operations-api/fixtures";
import { defaultPlanningConfig } from "@/lib/scenario-planning/inputs";
import type {
  Workspace,
  Draft,
  Job,
  CreateDraft,
} from "@/types/generated/scenario-planning";
export const scenarioActor = {
  id: "10000000-0000-4000-8000-000000000001",
  role: "ENGINEER",
  username: "scenario-contract-engineer",
};
export const workspaceId = "20000000-0000-4000-8000-000000000001";
export const draftId = "30000000-0000-4000-8000-000000000001";
export const runId = "40000000-0000-4000-8000-000000000001";
export const scenarioSnapshot = () =>
  structuredClone(createOperationsDemoFixtures().request.factory_snapshot);
export function scenarioWorkspace(): Workspace {
  const snapshot = scenarioSnapshot();
  return {
    workspace_id: workspaceId,
    name: "Maintenance duration review",
    baseline: {
      factory_id: snapshot.factory_id,
      snapshot_id: snapshot.snapshot_id,
      snapshot_hash: "a".repeat(64),
      plan_version: 1,
      publication: {
        schedule_id: "reference-S1-P1",
        schedule_revision: 1,
        schedule_hash: "b".repeat(64),
      },
    },
    planning_config: defaultPlanningConfig(),
    engine_version: "proposal-engine-test",
    contract_version: "proposal-schema-test",
    created_by: scenarioActor.id,
    created_at: snapshot.captured_at,
    current_head: {
      snapshot_id: snapshot.snapshot_id,
      plan_version: 1,
      revision: 7,
    },
    stale: false,
  };
}
export function scenarioDraft(): Draft {
  const snapshot = scenarioSnapshot();
  const request = snapshot.maintenance_requests![0];
  return {
    workspace_id: workspaceId,
    scenario_id: draftId,
    name: "Longer maintenance",
    note: "Contract isolation; not a real evaluated scenario",
    revision: 2,
    created_at: snapshot.captured_at,
    updated_at: snapshot.captured_at,
    overrides: [
      {
        type: "MAINTENANCE_DURATION",
        maintenance_request_id: request.maintenance_request_id,
        expected_duration_minutes: 90,
      },
    ],
    objective_weights: { ...defaultPlanningConfig().objective_weights },
  };
}
export function scenarioDraftInput(): CreateDraft {
  const { name, note, overrides, objective_weights } = scenarioDraft();
  return { name, note, overrides, objective_weights };
}
export function scenarioJob(
  status: Job["status"] = "QUEUED",
  scenario = true,
): Job {
  const workspace = scenarioWorkspace();
  return {
    workspace_id: workspaceId,
    job_id: runId,
    kind: "RUN",
    status,
    input_hash: "c".repeat(64),
    source_scenario_id: scenario ? draftId : null,
    source_revision: scenario ? 2 : null,
    source_run_id: null,
    engine_version: workspace.engine_version,
    contract_version: workspace.contract_version,
    attempt: 1,
    created_at: workspace.created_at,
    started_at: null,
    completed_at: null,
    deadline_at: "2026-09-22T09:00:00Z",
    error_code: null,
    result: null,
    points: [],
  };
}
