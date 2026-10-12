import { OperationsApiError } from "./client";

export type OperationsReadFailure = {
  kind: "unauthorized" | "not-found" | "unavailable" | "invalid-cursor" | "network-error" | "error";
  message: string;
};
export class OperationsReadContractError extends Error {}
export function operationsReadFailure(error: unknown): OperationsReadFailure {
  if (error instanceof OperationsReadContractError) {
    return { kind: "error", message: "The read response contains inconsistent identity or pagination metadata. Data is hidden; refresh and try again." };
  }
  if (error instanceof Error && error.name === "AuthRedirectError") {
    return { kind: "unauthorized", message: "Your session has expired. Sign in to read decision cases." };
  }
  if (error instanceof OperationsApiError) {
    if (error.status === 401) return { kind: "unauthorized", message: "Sign in to read decision cases and their history." };
    if (error.status === 403) return { kind: "unauthorized", message: "Your account does not have permission to read this data." };
    if (error.status === 404) return { kind: "not-found", message: "The requested factory or case is unavailable, or your account cannot access it." };
    if (error.status === 503) return { kind: "unavailable", message: "The decision case service is temporarily unavailable." };
    if (error.status === 400 && (error.apiError?.code ?? error.contractError?.code) === "INVALID_CURSOR") {
      return { kind: "invalid-cursor", message: "This cursor is no longer valid for your account or filters. Refresh from the first page." };
    }
    return { kind: "error", message: "The read response could not be used safely. Refresh and try again." };
  }
  return { kind: "network-error", message: "The request did not complete. Check your connection and retry." };
}
