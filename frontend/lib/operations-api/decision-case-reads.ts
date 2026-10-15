import type { DecisionCaseStatusResponse } from "@/types/generated/operations";

/** Backend read transport DTOs. See backend/openapi.yaml and
 * backend/docs/operations-context/decision-case-list.d.ts. These are not the
 * canonical AI DecisionEvent (which has a different wire shape).
 */
export type DecisionCaseListStatus = DecisionCaseStatusResponse["status"];
export interface DecisionCaseListQuery {
  factory_id: string;
  status?: DecisionCaseListStatus;
  mode?: DecisionCaseStatusResponse["mode"];
  cursor?: string;
  limit?: number;
}
export interface DecisionCaseListItem {
  schema_version: "3.0";
  decision_case_id: string;
  factory_id: string;
  mode: DecisionCaseStatusResponse["mode"];
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
    decision: "APPROVE" | "REJECT";
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
export interface DecisionCaseHistoryEvent {
  id: string;
  case_id: string;
  sequence: number;
  type: string;
  actor: { kind: "HUMAN" | "SYSTEM"; id: string };
  occurred_at: string;
  payload: {
    status?: "CREATED";
    from_status?: string;
    to_status?: string;
    revision?: number;
    command?: "APPROVE" | "REJECT" | "COMMIT";
    recommendation_id?: string;
    candidate_plan_id?: string | null;
    candidate_version?: number | null;
    candidate_hash?: string | null;
    schedule_hash?: string | null;
    plan_version?: number;
  };
}
export interface DecisionCaseEventsResponse {
  success: true;
  data: DecisionCaseHistoryEvent[];
  meta: { has_more: boolean; next_after_sequence: number };
}

export const DECISION_CASE_STATUSES: readonly DecisionCaseListStatus[] = [
  "CREATED", "ANALYZING", "GENERATING", "VALIDATING", "EXPLAINING",
  "AWAITING_APPROVAL", "APPROVED", "MODIFIED", "REJECTED", "COMMITTED", "FAILED", "CANCELLED",
];
export function isDecisionCaseStatus(value: string): value is DecisionCaseListStatus {
  return DECISION_CASE_STATUSES.some(status => status === value);
}
export function decisionCaseHref(caseId: string): string {
  return `/operations/recommendations?${new URLSearchParams({ caseId })}`;
}
