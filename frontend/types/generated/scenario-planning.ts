/* Generated consumer of Backend PROPOSAL aa56ecfceb85b6d6f78158ac34d37440103942a4. Engine results remain UNFROZEN; do not infer fields. */

/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "EnqueueRun".
 */
export type EnqueueRun =
  | {
      kind: "BASELINE";
    }
  | {
      kind: "SCENARIO";
      scenario_id: string;
      expected_revision: number;
    };

export interface ScenarioProposalCatalog {}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "CreateWorkspace".
 */
export interface CreateWorkspace {
  factory_id: string;
  name: string;
  expected_head: {
    snapshot_id: string;
    plan_version: number;
    revision: number;
  };
  planning_config: {
    horizon_minutes: number;
    candidate_limit: number;
    solver_timeout_seconds: number;
    simulation_runs: number;
    base_seed: number;
    objective_weights: {
      production: number;
      reliability: number;
      maintenance: number;
      workforce: number;
      schedule_stability: number;
    };
    /**
     * @minItems 1
     * @maxItems 3
     */
    allowed_strategy_ids: [
      "PRODUCTION_PRIORITY" | "BALANCED" | "RELIABILITY_PRIORITY",
      ...("PRODUCTION_PRIORITY" | "BALANCED" | "RELIABILITY_PRIORITY")[]
    ];
  };
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "CreateDraft".
 */
export interface CreateDraft {
  name: string;
  note: string;
  /**
   * @maxItems 5
   */
  overrides: (
    | {
        type: "TECHNICIAN_UNAVAILABLE";
        technician_id: string;
        start_at: string;
        end_at: string;
      }
    | {
        type: "MAINTENANCE_DURATION";
        maintenance_request_id: string;
        expected_duration_minutes: number;
      }
    | {
        type: "DEFER_MAINTENANCE";
        maintenance_request_id: string;
        earliest_start_at: string;
      }
  )[];
  objective_weights: {
    production: number;
    reliability: number;
    maintenance: number;
    workforce: number;
    schedule_stability: number;
  };
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "UpdateDraft".
 */
export interface UpdateDraft {
  name: string;
  note: string;
  /**
   * @maxItems 5
   */
  overrides: (
    | {
        type: "TECHNICIAN_UNAVAILABLE";
        technician_id: string;
        start_at: string;
        end_at: string;
      }
    | {
        type: "MAINTENANCE_DURATION";
        maintenance_request_id: string;
        expected_duration_minutes: number;
      }
    | {
        type: "DEFER_MAINTENANCE";
        maintenance_request_id: string;
        earliest_start_at: string;
      }
  )[];
  objective_weights: {
    production: number;
    reliability: number;
    maintenance: number;
    workforce: number;
    schedule_stability: number;
  };
  expected_revision: number;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "EnqueueSensitivity".
 */
export interface EnqueueSensitivity {
  source_run_id: string;
  axis:
    | {
        type: "MAINTENANCE_DURATION";
        maintenance_request_id: string;
        /**
         * @minItems 1
         * @maxItems 7
         */
        values: [number, ...number[]];
      }
    | {
        type: "OBJECTIVE_WEIGHT";
        weight: "production" | "reliability" | "maintenance" | "workforce" | "schedule_stability";
        /**
         * @minItems 1
         * @maxItems 7
         */
        values: [number, ...number[]];
      };
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "LiveEvaluation".
 */
export interface LiveEvaluation {
  source_run_id: string;
  confirmation: true;
  expected_head: {
    snapshot_id: string;
    plan_version: number;
    revision: number;
  };
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "PlanningConfig".
 */
export interface PlanningConfig {
  horizon_minutes: number;
  candidate_limit: number;
  solver_timeout_seconds: number;
  simulation_runs: number;
  base_seed: number;
  objective_weights: {
    production: number;
    reliability: number;
    maintenance: number;
    workforce: number;
    schedule_stability: number;
  };
  /**
   * @minItems 1
   * @maxItems 3
   */
  allowed_strategy_ids: [
    "PRODUCTION_PRIORITY" | "BALANCED" | "RELIABILITY_PRIORITY",
    ...("PRODUCTION_PRIORITY" | "BALANCED" | "RELIABILITY_PRIORITY")[]
  ];
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "Head".
 */
export interface Head {
  snapshot_id: string;
  plan_version: number;
  revision: number;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "Error".
 */
export interface Error {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "Baseline".
 */
export interface Baseline {
  factory_id: string;
  snapshot_id: string;
  snapshot_hash: string;
  plan_version: number;
  publication: {
    schedule_id: string;
    schedule_revision: number;
    schedule_hash: string;
  } | null;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "Workspace".
 */
export interface Workspace {
  workspace_id: string;
  name: string;
  baseline: Baseline;
  planning_config: PlanningConfig;
  engine_version: string;
  contract_version: string;
  created_by: string;
  created_at: string;
  current_head: Head | null;
  stale: boolean;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "Draft".
 */
export interface Draft {
  name: string;
  note: string;
  /**
   * @maxItems 5
   */
  overrides: (
    | {
        type: "TECHNICIAN_UNAVAILABLE";
        technician_id: string;
        start_at: string;
        end_at: string;
      }
    | {
        type: "MAINTENANCE_DURATION";
        maintenance_request_id: string;
        expected_duration_minutes: number;
      }
    | {
        type: "DEFER_MAINTENANCE";
        maintenance_request_id: string;
        earliest_start_at: string;
      }
  )[];
  objective_weights: {
    production: number;
    reliability: number;
    maintenance: number;
    workforce: number;
    schedule_stability: number;
  };
  workspace_id: string;
  scenario_id: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "Job".
 */
export interface Job {
  workspace_id: string;
  job_id: string;
  kind: "RUN" | "SENSITIVITY";
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  input_hash: string;
  source_scenario_id: string | null;
  source_revision: number | null;
  source_run_id: string | null;
  engine_version: string;
  contract_version: string;
  attempt: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  deadline_at: string;
  error_code: string | null;
  result: EngineResult | null;
  points: Point[];
}
/**
 * UNFROZEN dependency: exact versioned Flex result schema must replace this proposal before consumer integration. No backend-defined scoring or acceptance claim.
 *
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "EngineResult".
 */
export interface EngineResult {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "Point".
 */
export interface Point {
  point_index: number;
  value: number | null;
  status: "QUEUED" | "RUNNING" | "FEASIBLE" | "NO_FEASIBLE_PLAN" | "FAILED" | "TIMEOUT";
  error_code: string | null;
  result: EngineResult | null;
}
/**
 * UNFROZEN dependency: Flex authoritative metric/unit/null-reason/delta/normalization/tie-break DTO; Node never recomputes scoring.
 *
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "Comparison".
 */
export interface Comparison {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "LiveCreated".
 */
export interface LiveCreated {
  workspace_id: string;
  source_run_id: string;
  decision_case_id: string;
  mode: "LIVE";
  current_head: Head;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "post_scenario_workspaces".
 */
export interface PostScenarioWorkspaces {
  success: true;
  data: Workspace;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "get_scenario_workspaces".
 */
export interface GetScenarioWorkspaces {
  success: true;
  data: {
    items: Workspace[];
    next_cursor: string | null;
  };
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "get_scenario_workspaces_by_workspace_id".
 */
export interface GetScenarioWorkspacesByWorkspaceId {
  success: true;
  data: Workspace;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "post_scenario_workspaces_by_workspace_id_scenarios".
 */
export interface PostScenarioWorkspacesByWorkspaceIdScenarios {
  success: true;
  data: Draft;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "get_scenario_workspaces_by_workspace_id_scenarios".
 */
export interface GetScenarioWorkspacesByWorkspaceIdScenarios {
  success: true;
  data: {
    items: Draft[];
    next_cursor: string | null;
  };
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "get_scenario_workspaces_by_workspace_id_scenarios_by_scenario_id".
 */
export interface GetScenarioWorkspacesByWorkspaceIdScenariosByScenarioId {
  success: true;
  data: Draft;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "patch_scenario_workspaces_by_workspace_id_scenarios_by_scenario_id".
 */
export interface PatchScenarioWorkspacesByWorkspaceIdScenariosByScenarioId {
  success: true;
  data: Draft;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "post_scenario_workspaces_by_workspace_id_runs".
 */
export interface PostScenarioWorkspacesByWorkspaceIdRuns {
  success: true;
  data: Job;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "get_scenario_workspaces_by_workspace_id_runs".
 */
export interface GetScenarioWorkspacesByWorkspaceIdRuns {
  success: true;
  data: {
    items: Job[];
    next_cursor: string | null;
  };
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "get_scenario_workspaces_by_workspace_id_runs_by_run_id".
 */
export interface GetScenarioWorkspacesByWorkspaceIdRunsByRunId {
  success: true;
  data: Job;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "get_scenario_workspaces_by_workspace_id_compare".
 */
export interface GetScenarioWorkspacesByWorkspaceIdCompare {
  success: true;
  data: Comparison;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "post_scenario_workspaces_by_workspace_id_sensitivity_jobs".
 */
export interface PostScenarioWorkspacesByWorkspaceIdSensitivityJobs {
  success: true;
  data: Job;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "get_scenario_workspaces_by_workspace_id_sensitivity_jobs".
 */
export interface GetScenarioWorkspacesByWorkspaceIdSensitivityJobs {
  success: true;
  data: {
    items: Job[];
    next_cursor: string | null;
  };
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "get_scenario_workspaces_by_workspace_id_sensitivity_jobs_by_job_id".
 */
export interface GetScenarioWorkspacesByWorkspaceIdSensitivityJobsByJobId {
  success: true;
  data: Job;
}
/**
 * This interface was referenced by `ScenarioProposalCatalog`'s JSON-Schema
 * via the `definition` "post_scenario_workspaces_by_workspace_id_live_evaluations".
 */
export interface PostScenarioWorkspacesByWorkspaceIdLiveEvaluations {
  success: true;
  data: LiveCreated;
}
