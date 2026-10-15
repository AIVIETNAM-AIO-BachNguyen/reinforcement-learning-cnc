import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DecisionCaseAuditTimeline } from "@/components/operations/decision-case-audit-timeline";
import { createOperationsApiClient } from "@/lib/operations-api/client";
import { readDecisionCaseEvents, useDecisionCaseEvents } from "@/lib/operations-api/use-decision-case-events";
import { createMockOperationsApiClient } from "@/lib/operations-api/mock";
import { caseEventsFixture } from "./decision-case-read-fixtures";
import { deferred } from "./product-api-test-utils";
import type { DecisionCaseEventsResponse } from "@/lib/operations-api/decision-case-reads";

const caseId = caseEventsFixture().data[0].case_id;

describe("complete authoritative audit reads", () => {
  it("includes newly appended events exactly once on a complete refresh", async () => {
    const user = userEvent.setup();
    let fixture = caseEventsFixture();
    const api = createOperationsApiClient({ fetcher: async () => Response.json(fixture) });
    render(<DecisionCaseAuditTimeline api={api} caseId={caseId} />);
    const timeline = await screen.findByRole("list", { name: "Decision case audit events" });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(2);
    fixture = { ...fixture, data: [...fixture.data, { ...fixture.data[1], id: "new-event", sequence: 9, type: "PUBLICATION_CONFIRMED", payload: {} }], meta: { has_more: false, next_after_sequence: 9 } };
    await user.click(screen.getByRole("button", { name: "Refresh history" }));
    await waitFor(() => expect(within(timeline).getAllByRole("listitem")).toHaveLength(3));
    expect(screen.getAllByText(/PUBLICATION_CONFIRMED/)).toHaveLength(1);
  });
  it("drains multiple pages using server sequence metadata and refreshes without duplicates or writes", async () => {
    const user = userEvent.setup();
    const events = caseEventsFixture().data;
    const fetcher = vi.fn<typeof fetch>(async input => {
      const after = new URL(String(input), "http://localhost").searchParams.get("after_sequence");
      return Response.json(after === "0" ? { success: true, data: [events[0]], meta: { has_more: true, next_after_sequence: 7 } }
        : { success: true, data: [events[1]], meta: { has_more: false, next_after_sequence: 8 } });
    });
    render(<DecisionCaseAuditTimeline api={createOperationsApiClient({ fetcher })} caseId={caseId} />);
    const timeline = await screen.findByRole("list", { name: "Decision case audit events" });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("2 events · 2 pages read · complete read")).toBeInTheDocument();
    expect(screen.getByText("APPROVED → COMMITTED")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh history" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(2);
    expect(fetcher.mock.calls.map(([input]) => new URL(String(input), "http://localhost").searchParams.get("after_sequence"))).toEqual(["0", "7", "0", "7"]);
    expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("does not publish a partial page if a subsequent page fails; retry starts at zero", async () => {
    const user = userEvent.setup();
    const fixture = caseEventsFixture();
    let failed = false;
    const fetcher = vi.fn<typeof fetch>(async input => {
      const after = new URL(String(input), "http://localhost").searchParams.get("after_sequence");
      if (after === "0") return Response.json({ ...fixture, data: [fixture.data[0]], meta: { has_more: true, next_after_sequence: 7 } });
      if (!failed) { failed = true; throw new TypeError("Disconnected"); }
      return Response.json({ ...fixture, data: [fixture.data[1]] });
    });
    render(<DecisionCaseAuditTimeline api={createOperationsApiClient({ fetcher })} caseId={caseId} />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("list");
    expect(fetcher.mock.calls.map(([input]) => new URL(String(input), "http://localhost").searchParams.get("after_sequence"))).toEqual(["0", "7", "0", "7"]);
  });
  it.each([401, 403, 404, 503])("fails closed on %s, including auth loss during refresh", async status => {
    const user = userEvent.setup();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(caseEventsFixture())).mockResolvedValue(Response.json({ success: false }, { status }));
    render(<DecisionCaseAuditTimeline api={createOperationsApiClient({ fetcher })} caseId={caseId} />);
    await screen.findByRole("list");
    await user.click(screen.getByRole("button", { name: "Refresh history" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    if (status === 401 || status === 403) expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
  it("shows an empty response without fabricating status events", async () => {
    const api = createOperationsApiClient({ fetcher: async () => Response.json({ success: true, data: [], meta: { has_more: false, next_after_sequence: 0 } }) });
    render(<DecisionCaseAuditTimeline api={api} caseId={caseId} />);
    await screen.findByText("No audit events");
    expect(screen.queryByText("CASE_CREATED")).not.toBeInTheDocument();
  });
  it("displays authoritative publication from case detail and preserves unknown event types", async () => {
    const fixture = caseEventsFixture();
    fixture.data[0].type = "FUTURE_PUBLIC_EVENT";
    fixture.data[0].payload = {};
    const api = createOperationsApiClient({ fetcher: async () => Response.json(fixture) });
    render(<DecisionCaseAuditTimeline api={api} caseId={caseId} publication={{ decision_case_id: caseId, factory_id: "factory-1", snapshot_id: "snapshot-1", schedule_id: "published-schedule", schedule_revision: 9, plan_version: 1, schedule_hash: "b".repeat(64), actor_id: "committer", committed_at: "2026-10-11T02:01:00Z" }} />);
    await screen.findByText(/FUTURE_PUBLIC_EVENT/);
    expect(screen.getByLabelText("Authoritative case publication")).toHaveTextContent("published-schedule");
    expect(screen.getByLabelText("Authoritative case publication")).toHaveTextContent("committer");
  });
  it.each(["case", "sequence", "cursor", "repeat"])("rejects inconsistent %s without rendering a mixed timeline", async mismatch => {
    const fixture = caseEventsFixture();
    if (mismatch === "case") fixture.data[1].case_id = "other-case";
    if (mismatch === "sequence") fixture.data[1].sequence = 7;
    if (mismatch === "cursor") fixture.meta.next_after_sequence = 9;
    if (mismatch === "repeat") fixture.data[1].id = fixture.data[0].id;
    const api = createOperationsApiClient({ fetcher: async () => Response.json(fixture) });
    await expect(readDecisionCaseEvents(api, caseId, new AbortController().signal)).rejects.toThrow("Inconsistent");
  });
  it("aborts old/unmounted requests and never lets late responses replace a new case", async () => {
    const api = createMockOperationsApiClient();
    const old = deferred<DecisionCaseEventsResponse>();
    const signals: AbortSignal[] = [];
    const read = vi.spyOn(api, "listEvents").mockImplementation(async (id, _after, options) => {
      signals.push(options!.signal!);
      if (id === "old-case") return old.promise;
      return { success: true, data: [], meta: { has_more: false, next_after_sequence: 0 } };
    });
    const { result, rerender, unmount } = renderHook(({ id }) => useDecisionCaseEvents({ api, caseId: id }), { initialProps: { id: "old-case" } });
    rerender({ id: "new-case" });
    await waitFor(() => expect(result.current.state.kind).toBe("ready"));
    expect(signals[0].aborted).toBe(true);
    await act(async () => old.resolve(caseEventsFixture()));
    expect(result.current.state.events).toEqual([]);
    unmount();
    expect(signals[1].aborted).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
