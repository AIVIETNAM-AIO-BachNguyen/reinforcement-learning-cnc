"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationsApiClient } from "./client";
import type { DecisionCaseListItem, DecisionCaseListQuery, DecisionCaseListResponse } from "./decision-case-reads";
import { OperationsReadContractError, operationsReadFailure, type OperationsReadFailure } from "./read-error";

type State = {
  scope: string;
  kind: "loading" | "ready" | "missing-factory" | OperationsReadFailure["kind"];
  items: DecisionCaseListItem[];
  meta?: DecisionCaseListResponse["meta"];
  message?: string;
  busy: boolean;
};

/** Opaque server cursors only. A changed filter/actor error never reuses a cursor.
 * Refresh restarts the list; next-page retries keep the exact read query.
 */
export function useDecisionCases({ api, query }: { api: OperationsApiClient; query: Omit<DecisionCaseListQuery, "cursor"> }) {
  const { factory_id, status, mode, limit = 25 } = query;
  const scope = JSON.stringify([factory_id, status, mode, limit]);
  const [state, setState] = useState<State>({ scope, kind: "loading", items: [], busy: true });
  const controller = useRef<AbortController | null>(null);
  const active = useRef(0);
  const current = useRef(state);
  current.current = state;
  const lastAttempt = useRef<{ cursor?: string; append: boolean }>({ append: false });
  const cancel = useCallback(() => { ++active.current; controller.current?.abort(); }, []);

  const read = useCallback(async (cursor?: string, append = false) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const requestId = ++active.current;
    lastAttempt.current = { cursor, append };
    if (!factory_id.trim()) {
      setState({ scope, kind: "missing-factory", items: [], busy: false });
      return;
    }
    const previous = append && current.current.scope === scope ? current.current.items : [];
    setState({ scope, kind: previous.length ? "ready" : "loading", items: previous,
      meta: append ? current.current.meta : undefined, busy: true });
    try {
      const page = await api.listDecisionCases({ factory_id, status, mode, limit, ...(cursor ? { cursor } : {}) }, { signal: abort.signal });
      if (abort.signal.aborted || requestId !== active.current) return;
      if (page.meta.factory_id !== factory_id || page.data.some(item => item.factory_id !== factory_id
        || (status && item.status !== status) || (mode && item.mode !== mode))
        || (page.meta.has_more && (!page.meta.next_cursor || page.meta.next_cursor === cursor || !page.data.length))
        || (!page.meta.has_more && page.meta.next_cursor !== null)) {
        throw new OperationsReadContractError("Invalid case page scope or pagination metadata");
      }
      const items = new Map(previous.map(item => [item.decision_case_id, item]));
      for (const item of page.data) items.set(item.decision_case_id, item);
      setState({ scope, kind: "ready", items: [...items.values()], meta: page.meta, busy: false });
    } catch (error: unknown) {
      if (abort.signal.aborted || requestId !== active.current) return;
      const failure = operationsReadFailure(error);
      // Authorization and invalid cursor must discard previously accessible rows.
      const keep = failure.kind === "network-error" || failure.kind === "unavailable";
      setState({ scope, ...failure, items: keep ? previous : [], meta: keep ? current.current.meta : undefined, busy: false });
    }
  }, [api, factory_id, status, mode, limit, scope]);

  useEffect(() => {
    void read();
    return cancel;
  }, [read, cancel]);

  const refresh = useCallback(() => { void read(); }, [read]);
  const retry = useCallback(() => {
    if (current.current.kind === "invalid-cursor" || current.current.kind === "unauthorized") void read();
    else void read(lastAttempt.current.cursor, lastAttempt.current.append);
  }, [read]);
  const loadMore = useCallback(() => {
    const value = current.current;
    if (value.scope !== scope || value.busy || value.kind !== "ready" || !value.meta?.has_more || !value.meta.next_cursor) return;
    // Lock immediately, before React renders the disabled button.
    current.current = { ...value, busy: true };
    void read(value.meta.next_cursor, true);
  }, [read, scope]);
  return { state: state.scope === scope ? state : { scope, kind: "loading" as const, items: [], busy: true }, refresh, retry, loadMore };
}
