import list from "../../backend/examples/decision-cases.list.json";
import history from "../../backend/examples/decision-case-events.page.json";
import type { DecisionCaseEventsResponse, DecisionCaseListResponse } from "@/lib/operations-api/decision-case-reads";

/** Exact backend handoff examples, never imported by a real-mode data source. */
export function caseListFixture(): DecisionCaseListResponse {
  return structuredClone(list) as unknown as DecisionCaseListResponse;
}
export function caseEventsFixture(): DecisionCaseEventsResponse {
  return structuredClone(history) as unknown as DecisionCaseEventsResponse;
}
