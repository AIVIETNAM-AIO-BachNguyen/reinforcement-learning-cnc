import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockOperationsApiClient } from "@/lib/operations-api/mock";
import { OperationsApiError } from "@/lib/operations-api/client";
import { useDecisionCases } from "@/lib/operations-api/use-decision-cases";
import type { DecisionCaseListResponse } from "@/lib/operations-api/decision-case-reads";
import { caseListFixture } from "./decision-case-read-fixtures";
import { deferred } from "./product-api-test-utils";

describe("case list cancellation and scoped pagination", () => {
  it("aborts filter changes/unmount, ignores late responses, and never reuses a cursor", async () => {
    const api = createMockOperationsApiClient();
    const old = deferred<DecisionCaseListResponse>();
    const signals: AbortSignal[] = [];
    const read = vi.spyOn(api, "listDecisionCases").mockImplementation(async (query, options) => {
      signals.push(options!.signal!);
      return query.factory_id === "old-factory" ? old.promise : caseListFixture();
    });
    const { result, rerender, unmount } = renderHook(({ factory }) => useDecisionCases({ api, query: { factory_id: factory } }), { initialProps: { factory: "old-factory" } });
    rerender({ factory: "factory-1" });
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(signals[0].aborted).toBe(true);
    await act(async () => old.resolve({ ...caseListFixture(), meta: { ...caseListFixture().meta, factory_id: "old-factory" } }));
    expect(result.current.state.items[0].factory_id).toBe("factory-1");
    expect(read.mock.calls[1][0]).not.toHaveProperty("cursor");
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
  it("keeps an exact failed next-page query for retry, but INVALID_CURSOR restarts from the first page", async () => {
    const api = createMockOperationsApiClient();
    const first = caseListFixture();
    first.meta = { ...first.meta, has_more: true, next_cursor: "opaque" };
    const read = vi.spyOn(api, "listDecisionCases").mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new TypeError("network"))
      .mockRejectedValueOnce(new OperationsApiError(400, { success: false, error: { code: "INVALID_CURSOR" } }))
      .mockResolvedValue(caseListFixture());
    const { result } = renderHook(() => useDecisionCases({ api, query: { factory_id: "factory-1" } }));
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    act(() => { result.current.loadMore(); result.current.loadMore(); });
    await waitFor(() => expect(result.current.state.kind).toBe("network-error"));
    expect(read).toHaveBeenCalledTimes(2);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.kind).toBe("invalid-cursor"));
    expect(read.mock.calls[2][0].cursor).toBe("opaque");
    expect(result.current.state.items).toEqual([]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(read.mock.calls[3][0]).not.toHaveProperty("cursor");
  });
  it("does not repeat a cursor or show a mixed-factory response", async () => {
    const api = createMockOperationsApiClient();
    vi.spyOn(api, "listDecisionCases").mockResolvedValue(caseListFixture());
    const { result } = renderHook(() => useDecisionCases({ api, query: { factory_id: "other-factory" } }));
    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    expect(result.current.state.items).toEqual([]);
  });
});
