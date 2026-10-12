"use client";

import { useCallback, useEffect, useState } from "react";
import type { OperationsApiClient } from "./client";
import type { DecisionCaseEventsResponse, DecisionCaseHistoryEvent } from "./decision-case-reads";
import { OperationsReadContractError, operationsReadFailure, type OperationsReadFailure } from "./read-error";

type State = {
  caseId: string;
  kind: "loading" | "ready" | OperationsReadFailure["kind"];
  events: DecisionCaseHistoryEvent[];
  pages: DecisionCaseEventsResponse["meta"][];
  message?: string;
  busy: boolean;
};

/** Complete, atomic reads: only publish after all pages have succeeded.
 * Sequence (not time or revision) orders history. Refresh rebuilds from zero,
 * replacing rather than appending. This cannot retain duplicates or skip pages.
 */
export async function readDecisionCaseEvents(api: OperationsApiClient, caseId: string, signal: AbortSignal, limit = 100) {
  const events: DecisionCaseHistoryEvent[] = [];
  const pages: DecisionCaseEventsResponse["meta"][] = [];
  const ids = new Set<string>();
  let after = 0;
  do {
    signal.throwIfAborted();
    const page = await api.listEvents(caseId, after, { signal, limit });
    signal.throwIfAborted();
    let last = after;
    for (const event of page.data) {
      if (event.case_id !== caseId || !Number.isSafeInteger(event.sequence) || event.sequence <= last || ids.has(event.id)) {
        throw new OperationsReadContractError("Inconsistent audit event identity or sequence");
      }
      last = event.sequence;
      ids.add(event.id);
      events.push(event);
    }
    if (page.meta.next_after_sequence !== last || (page.meta.has_more && last <= after)) {
      throw new OperationsReadContractError("Inconsistent audit pagination metadata");
    }
    pages.push(page.meta);
    after = page.meta.next_after_sequence;
    if (!page.meta.has_more) return { events, pages };
  } while (!signal.aborted);
  signal.throwIfAborted();
  throw new Error("Audit read cancelled");
}

export function useDecisionCaseEvents({ api, caseId, refreshToken, limit = 100 }: {
  api: OperationsApiClient; caseId: string; refreshToken?: string | number; limit?: number;
}) {
  const [state, setState] = useState<State>({ caseId, kind: "loading", events: [], pages: [], busy: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState(previous => previous.caseId === caseId && previous.kind === "ready"
      ? { ...previous, busy: true }
      : { caseId, kind: "loading", events: [], pages: [], busy: true });
    void readDecisionCaseEvents(api, caseId, abort.signal, limit).then(data => {
      if (!abort.signal.aborted) setState({ caseId, kind: "ready", ...data, busy: false });
    }).catch((error: unknown) => {
      if (!abort.signal.aborted) setState({ caseId, ...operationsReadFailure(error), events: [], pages: [], busy: false });
    });
    return () => abort.abort();
  }, [api, caseId, limit, revision, refreshToken]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return { state: state.caseId === caseId ? state : { caseId, kind: "loading" as const, events: [], pages: [], busy: true }, refresh };
}
