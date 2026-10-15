/** Transport DTO for GET /api/v1/decision-cases; canonical status DTO is unchanged. */
export type DecisionCaseListStatus = 'CREATED' | 'ANALYZING' | 'GENERATING' | 'VALIDATING'
  | 'EXPLAINING' | 'AWAITING_APPROVAL' | 'APPROVED' | 'MODIFIED' | 'REJECTED'
  | 'COMMITTED' | 'FAILED' | 'CANCELLED';
export interface DecisionCaseListQuery {
  factory_id: string;
  status?: DecisionCaseListStatus;
  mode?: 'LIVE' | 'SIMULATION_ONLY';
  cursor?: string;
  limit?: number; // default 25, 1..100
}
export interface DecisionCaseListItem {
  schema_version: '3.0';
  decision_case_id: string;
  factory_id: string;
  mode: 'LIVE' | 'SIMULATION_ONLY';
  status: DecisionCaseListStatus;
  snapshot_id: string;
  created_at: string;
  updated_at: string;
  recommendation_id: string | null;
  committed_schedule_id: string | null;
  error_code: string | null;
  base_plan_version: number;
  case_revision: number;
  current_context: { snapshot_id: string; plan_version: number };
  stale: boolean;
  human_decision: {
    decision: 'APPROVE' | 'REJECT';
    recommendation_id: string;
    candidate_plan_id: string | null;
    candidate_version: number | null;
    actor_id: string;
    decided_at: string;
  } | null;
  publication: {
    schedule_id: string;
    schedule_revision: number;
    plan_version: number;
    snapshot_id: string;
    actor_id: string;
    committed_at: string;
  } | null;
}
export interface DecisionCaseListResponse {
  success: true;
  data: DecisionCaseListItem[];
  meta: { factory_id: string; limit: number; has_more: boolean; next_cursor: string | null };
}
