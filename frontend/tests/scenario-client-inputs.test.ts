import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import producer from "@/contracts/scenario-planning.proposal.openapi.json";
import manifest from "@/types/generated/scenario-planning.manifest.json";
import {
  createScenarioClient,
  matchesScenarioSchema,
  ScenarioError,
  scenarioErrorText,
} from "@/lib/scenario-planning/client";
import {
  requestedChanges,
  validateDraft,
  validateSweep,
  validateWeights,
} from "@/lib/scenario-planning/inputs";
import {
  scenarioHref,
  parseScenarioSelection,
} from "@/lib/scenario-planning/navigation";
import {
  scenarioWorkspace,
  scenarioDraft,
  scenarioDraftInput,
  scenarioJob,
  scenarioSnapshot,
  workspaceId,
  draftId,
  runId,
} from "./scenario-fixtures";
import { createMockOperationsApiClient } from "@/lib/operations-api/mock";
import { readFileSync } from "node:fs";

describe("pinned Scenario producer proposal", () => {
  it("keeps unreviewed schemas/capabilities explicit and does not generate a parallel KPI model", () => {
    const raw = readFileSync(
      "contracts/scenario-planning.proposal.openapi.json",
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(raw).digest("hex")).toBe(
      manifest.source_sha256,
    );
    expect(producer.components.schemas.EngineResult["x-contract-status"]).toBe(
      "PENDING_FLEX",
    );
    expect(manifest).toMatchObject({
      runnable: false,
      sensitivity: false,
      live_handoff: false,
    });
    expect(
      matchesScenarioSchema(
        { success: true, data: scenarioWorkspace() },
        "get_scenario_workspaces_by_workspace_id",
      ),
    ).toBe(true);
  });
  it("preserves cursor and sends the exact generated draft DTO/key/revision on PATCH", async () => {
    const draft = scenarioDraft();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: { items: [scenarioWorkspace()], next_cursor: "signed:+/=" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true, data: draft }));
    const api = createScenarioClient({
      fetcher,
      baseUrl: "https://api.test/api/v1",
    });
    const page = await api.listWorkspaces(
      scenarioWorkspace().baseline.factory_id,
      { cursor: "opaque+/=", limit: 20 },
    );
    expect(page.next_cursor).toBe("signed:+/=");
    expect(
      new URL(String(fetcher.mock.calls[0][0])).searchParams.get("cursor"),
    ).toBe("opaque+/=");
    const {
      workspace_id: _workspace,
      scenario_id: _scenario,
      revision,
      created_at: _created,
      updated_at: _updated,
      ...fields
    } = draft;
    const body = { ...fields, expected_revision: revision };
    await api.saveDraft(workspaceId, body, { key: "same-intent" }, draftId);
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      cache: "no-store",
      headers: { "Idempotency-Key": "same-intent" },
      body: JSON.stringify(body),
    });
  });
  it("rejects malformed/cross-factory/wrong IDs and never falls back to fixtures", async () => {
    const workspace = scenarioWorkspace();
    workspace.baseline.factory_id = "other-factory";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ success: true, data: workspace }))
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: { ...scenarioJob(), job_id: draftId },
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true, data: [] }));
    const api = createScenarioClient({ fetcher });
    await expect(
      api.workspace(workspaceId, "factory-demo-01"),
    ).rejects.toMatchObject({ code: "CONTEXT_MISMATCH" });
    await expect(api.run(workspaceId, runId)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(api.listWorkspaces("factory-demo-01")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it.each([401, 403, 404, 409, 503])(
    "keeps safe %s errors and support request ID",
    async (status) => {
      const api = createScenarioClient({
        fetcher: vi
          .fn()
          .mockResolvedValue(
            Response.json(
              {
                success: false,
                error: {
                  code: "SCENARIO_FAILURE",
                  message: "Private stack/report",
                },
                requestId: "req-support",
              },
              { status },
            ),
          ),
      });
      const error = await api
        .workspace(workspaceId, "F")
        .catch((e: unknown) => e);
      expect(error).toMatchObject({ status, requestId: "req-support" });
      expect(scenarioErrorText(error as ScenarioError)).not.toContain(
        "Private",
      );
    },
  );
  it("never reads current S2 for an unavailable historical S1 basis", async () => {
    const operations = createMockOperationsApiClient();
    const current = vi.spyOn(operations, "getOperationsSnapshot");
    const workspace = scenarioWorkspace();
    workspace.current_head!.snapshot_id = "S2";
    workspace.stale = true;
    const api = createScenarioClient({ operations });
    await expect(api.baselineEntities(workspace)).rejects.toMatchObject({
      code: "BASELINE_ENTITIES_UNAVAILABLE",
    });
    expect(current).not.toHaveBeenCalled();
  });
  it("rejects an S2 response arriving during an S1 basis read", async () => {
    const operations = createMockOperationsApiClient();
    const original = operations.getOperationsSnapshot.bind(operations);
    vi.spyOn(operations, "getOperationsSnapshot").mockImplementation(
      async (...args) => ({ ...(await original(...args)), snapshot_id: "S2" }),
    );
    await expect(
      createScenarioClient({ operations }).baselineEntities(
        scenarioWorkspace(),
      ),
    ).rejects.toMatchObject({ code: "BASELINE_ENTITIES_UNAVAILABLE" });
  });
  it("fail-closes all unreviewed engine operations before HTTP", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createScenarioClient({ fetcher });
    await expect(
      api.enqueueRun(workspaceId, { kind: "BASELINE" }, { key: "run" }),
    ).rejects.toMatchObject({ code: "DEPENDENCY_PENDING" });
    await expect(api.compare(workspaceId, [runId])).rejects.toMatchObject({
      code: "DEPENDENCY_PENDING",
    });
    await expect(
      api.enqueueSensitivity(
        workspaceId,
        {
          source_run_id: runId,
          axis: {
            type: "OBJECTIVE_WEIGHT",
            weight: "reliability",
            values: [0, 1, 2],
          },
        },
        { key: "sweep" },
      ),
    ).rejects.toMatchObject({ code: "DEPENDENCY_PENDING" });
    await expect(
      api.evaluateLive(
        workspaceId,
        {
          source_run_id: runId,
          confirmation: true,
          expected_head: scenarioWorkspace().current_head!,
        },
        { key: "live" },
      ),
    ).rejects.toMatchObject({ code: "DEPENDENCY_PENDING" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("requested assumptions only; no effective transform/scoring", () => {
  it("validates all three templates against real baseline resource types without mutating it", () => {
    const snapshot = scenarioSnapshot();
    const before = structuredClone(snapshot);
    const draft = scenarioDraftInput();
    draft.overrides.push(
      {
        type: "TECHNICIAN_UNAVAILABLE",
        technician_id: snapshot.technicians![0].technician_id,
        start_at: snapshot.planning_window.start_at,
        end_at: snapshot.planning_window.end_at,
      },
      {
        type: "DEFER_MAINTENANCE",
        maintenance_request_id:
          snapshot.maintenance_requests![0].maintenance_request_id,
        earliest_start_at: snapshot.planning_window.start_at,
      },
    );
    expect(validateDraft(draft, snapshot).overrides).toHaveLength(3);
    expect(snapshot).toEqual(before);
    expect(requestedChanges(draft, snapshot)[0]).toMatchObject({
      after: "90 min",
    });
  });
  it("rejects duplicate target/type, User-as-Technician, out-of-window and invalid numerics", () => {
    const snapshot = scenarioSnapshot();
    const draft = scenarioDraftInput();
    expect(() =>
      validateDraft(
        { ...draft, overrides: [...draft.overrides, ...draft.overrides] },
        snapshot,
      ),
    ).toThrow("DUPLICATE_OVERRIDE");
    expect(() =>
      validateDraft(
        {
          ...draft,
          overrides: [
            {
              type: "TECHNICIAN_UNAVAILABLE",
              technician_id: "10000000-0000-4000-8000-000000000001",
              start_at: snapshot.planning_window.start_at,
              end_at: snapshot.planning_window.end_at,
            },
          ],
        },
        snapshot,
      ),
    ).toThrow("INVALID_TARGET");
    expect(() =>
      validateDraft(
        {
          ...draft,
          overrides: [
            {
              type: "DEFER_MAINTENANCE",
              maintenance_request_id:
                snapshot.maintenance_requests![0].maintenance_request_id,
              earliest_start_at: snapshot.planning_window.end_at,
            },
          ],
        },
        snapshot,
      ),
    ).toThrow("INVALID_WINDOW");
    expect(() =>
      validateDraft(
        {
          ...draft,
          overrides: [
            {
              type: "MAINTENANCE_DURATION",
              maintenance_request_id:
                snapshot.maintenance_requests![0].maintenance_request_id,
              expected_duration_minutes: Infinity,
            },
          ],
        },
        snapshot,
      ),
    ).toThrow();
    expect(() =>
      validateWeights({
        production: 0,
        reliability: 0,
        maintenance: 0,
        workforce: 0,
        schedule_stability: 0,
      }),
    ).toThrow("INVALID_WEIGHTS");
  });
  it("validates <=7 finite unique sweep values without computing a response", () => {
    expect(() =>
      validateSweep({
        type: "OBJECTIVE_WEIGHT",
        weight: "production",
        values: [0, 0.5, 1, 2, 4],
      }),
    ).not.toThrow();
    expect(() =>
      validateSweep({
        type: "OBJECTIVE_WEIGHT",
        weight: "production",
        values: [1, 1],
      }),
    ).toThrow();
    expect(() =>
      validateSweep({
        type: "OBJECTIVE_WEIGHT",
        weight: "production",
        values: [NaN],
      }),
    ).toThrow();
    expect(() =>
      validateSweep({
        type: "OBJECTIVE_WEIGHT",
        weight: "production",
        values: [1, 2, 3, 4, 5, 6, 7, 8],
      }),
    ).toThrow();
  });
  it("round-trips factory/selection/compare/sensitivity in URLs", () => {
    const selection = parseScenarioSelection(
      {
        factory_id: "factory-A",
        scenario_id: draftId,
        run_id: runId,
        compare: `${runId},${draftId}`,
        sensitivity_id: workspaceId,
      },
      "fallback",
    );
    const href = scenarioHref(selection.factory_id, workspaceId, selection);
    expect(new URL(href, "https://local").searchParams.get("compare")).toBe(
      `${runId},${draftId}`,
    );
    expect(href).toContain("sensitivity_id=");
  });
});
