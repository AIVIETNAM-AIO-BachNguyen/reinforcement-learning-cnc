// @vitest-environment node
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { DecisionCaseListItem as BackendItem, DecisionCaseListQuery as BackendQuery, DecisionCaseListResponse as BackendResponse } from "../../backend/docs/operations-context/decision-case-list";
import { createOperationsApiClient, OperationsApiError } from "@/lib/operations-api/client";
import type { DecisionCaseListItem, DecisionCaseListQuery, DecisionCaseListResponse } from "@/lib/operations-api/decision-case-reads";
import { caseEventsFixture, caseListFixture } from "./decision-case-read-fixtures";

describe("authoritative case list and event wire contracts", () => {
  it("matches the backend handoff DTO exactly", () => {
    expectTypeOf<DecisionCaseListItem>().toEqualTypeOf<BackendItem>();
    expectTypeOf<DecisionCaseListQuery>().toEqualTypeOf<BackendQuery>();
    expectTypeOf<DecisionCaseListResponse>().toEqualTypeOf<BackendResponse>();
  });
  it("keeps list filters, opaque cursor, metadata, cookies, no-store and abort signal", async () => {
    const fixture = caseListFixture();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture));
    const api = createOperationsApiClient({ fetcher, baseUrl: "https://example.test/api/v1" });
    const signal = new AbortController().signal;
    const result = await api.listDecisionCases({ factory_id: "factory/a b", status: "COMMITTED", mode: "LIVE", cursor: "opaque/+?=", limit: 10 }, { signal });
    expect(result).toEqual(fixture);
    const [input, options] = fetcher.mock.calls[0];
    expect(Object.fromEntries(new URL(String(input)).searchParams)).toEqual({ factory_id: "factory/a b", status: "COMMITTED", mode: "LIVE", cursor: "opaque/+?=", limit: "10" });
    expect(options).toMatchObject({ method: "GET", signal, credentials: "include", cache: "no-store" });
  });
  it("reads backend HistoryEvent rather than AI DecisionEvent and retains every pagination field", async () => {
    const fixture = caseEventsFixture();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture));
    const api = createOperationsApiClient({ fetcher, baseUrl: "https://example.test/api/v1" });
    const signal = new AbortController().signal;
    expect(await api.listEvents("case/a b", 6, { signal, limit: 1 })).toEqual(fixture);
    expect(fetcher).toHaveBeenCalledWith("https://example.test/api/v1/decision-cases/case%2Fa%20b/events?after_sequence=6&limit=1", expect.objectContaining({ method: "GET", signal }));
  });
  it("fails closed when a success envelope drops pagination metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: true, data: [] }));
    const api = createOperationsApiClient({ fetcher });
    await expect(api.listDecisionCases({ factory_id: "factory-1" })).rejects.toBeInstanceOf(OperationsApiError);
    await expect(api.listEvents("case-1")).rejects.toBeInstanceOf(OperationsApiError);
  });
  it.each([401, 403, 404, 503])("preserves %s errors without fallback or automatic retry", async status => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: false, error: { code: "READ_FAILED" } }, { status }));
    const api = createOperationsApiClient({ fetcher });
    await expect(api.listDecisionCases({ factory_id: "factory-1" })).rejects.toMatchObject({ status });
    await expect(api.listEvents("case-1")).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
