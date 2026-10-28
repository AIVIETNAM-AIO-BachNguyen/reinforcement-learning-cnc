"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TokenUser } from "@/lib/auth";
import { AsyncState } from "@/components/research/async-state";
import { ScenarioEditor } from "@/components/scenario-planning/editor";
import {
  Dependency,
  IdentityDetails,
  ScenarioFailure,
  ScenarioFrame,
} from "@/components/scenario-planning/frame";
import {
  LiveHandoffReview,
  RunInspector,
  RunReview,
  SensitivityInputs,
} from "@/components/scenario-planning/run-panels";
import {
  scenarioApi,
  ScenarioError,
  type ScenarioClient,
} from "@/lib/scenario-planning/client";
import { useScenarioRead } from "@/lib/scenario-planning/hooks";
import {
  scenarioHref,
  type ScenarioSelection,
} from "@/lib/scenario-planning/navigation";
import type { Job, Workspace } from "@/types/generated/scenario-planning";
import { weightNames } from "@/lib/scenario-planning/inputs";
import { scenarioTime } from "./scenario-workspaces-page";

export function ScenarioWorkspacePage({
  workspaceId,
  selection,
  api = scenarioApi,
}: {
  workspaceId: string;
  selection: ScenarioSelection;
  api?: ScenarioClient;
}) {
  return (
    <ScenarioFrame factoryId={selection.factory_id} api={api}>
      {(actor, fresh) => (
        <WorkspaceContent
          key={`${actor.id}:${actor.role}:${selection.factory_id}:${workspaceId}`}
          api={api}
          actor={actor}
          sessionFresh={fresh}
          workspaceId={workspaceId}
          selection={selection}
        />
      )}
    </ScenarioFrame>
  );
}
function BaselineEditor({
  workspace,
  api,
  actor,
  fresh,
  children,
}: {
  workspace: Workspace;
  api: ScenarioClient;
  actor: TokenUser;
  fresh: boolean;
  children: (
    snapshot: Awaited<ReturnType<ScenarioClient["baselineEntities"]>>,
    fresh: boolean,
  ) => React.ReactNode;
}) {
  const baseline = useScenarioRead({
    api,
    actor,
    scope: `baseline:${workspace.baseline.factory_id}:${workspace.workspace_id}:${workspace.baseline.snapshot_id}:${workspace.current_head?.snapshot_id ?? "none"}`,
    read: (options) => api.baselineEntities(workspace, options),
  });
  return (
    <>
      {baseline.kind === "loading" ? (
        <AsyncState
          compact
          kind="loading"
          title="Verifying pinned baseline entities"
        />
      ) : null}
      {baseline.error ? (
        <ScenarioFailure error={baseline.error} retry={baseline.refresh} />
      ) : null}
      {baseline.data
        ? children(baseline.data, fresh && baseline.kind === "ready")
        : null}
    </>
  );
}
function SelectedRun({
  api,
  actor,
  workspace,
  runId,
}: {
  api: ScenarioClient;
  actor: TokenUser;
  workspace: Workspace;
  runId: string;
}) {
  const run = useScenarioRead({
    api,
    actor,
    scope: `run:${workspace.baseline.factory_id}:${workspace.workspace_id}:${runId}`,
    read: async (options) => {
      const result = await api.run(workspace.workspace_id, runId, options);
      if (
        result.engine_version !== workspace.engine_version ||
        result.contract_version !== workspace.contract_version
      )
        throw new ScenarioError(502, "CONTEXT_MISMATCH");
      return result;
    },
    polling: (data) => data.status === "QUEUED" || data.status === "RUNNING",
  });
  return (
    <div className="space-y-5">
      {run.kind === "loading" ? (
        <p role="status" className="text-sm text-slate-500">
          {run.data
            ? "Refreshing job — previous read shown"
            : "Loading saved job"}
        </p>
      ) : null}
      {run.error ? (
        <ScenarioFailure error={run.error} retry={run.refresh} />
      ) : null}
      {run.data ? (
        <>
          <RunInspector job={run.data} />
          <LiveHandoffReview
            source={run.data}
            workspace={workspace}
            api={api}
            actor={actor}
          />
        </>
      ) : null}
    </div>
  );
}
export function validateCompareSelection(ids: string[], jobs: Job[]) {
  if (new Set(ids).size !== ids.length || ids.length > 4)
    return "Choose at most four unique completed runs.";
  const selected = ids.map((id) => jobs.find((job) => job.job_id === id));
  if (
    selected.some(
      (job) => !job || job.status !== "SUCCEEDED" || job.kind !== "RUN",
    )
  )
    return "Every selection must be a completed run from this workspace. Load its saved row before selecting.";
  if (
    selected.filter((job) => job?.source_scenario_id === null).length > 1 ||
    selected.filter((job) => job?.source_scenario_id !== null).length > 3
  )
    return "Compare one baseline and at most three scenarios.";
  if (
    ids.length >= 2 &&
    selected.filter((job) => job?.source_scenario_id === null).length !== 1
  )
    return "Select one completed no-overrides baseline for direct comparison.";
  return undefined;
}
function WorkspaceContent({
  api,
  actor,
  sessionFresh,
  workspaceId,
  selection,
}: {
  api: ScenarioClient;
  actor: TokenUser;
  sessionFresh: boolean;
  workspaceId: string;
  selection: ScenarioSelection;
}) {
  const router = useRouter();
  const [selectionError, setSelectionError] = useState("");
  const selectedIds = selection.compare ?? [];
  const comparisonReads = useScenarioRead({
    api,
    actor,
    scope: `compare-identities:${selection.factory_id}:${workspaceId}:${selectedIds.join(",")}`,
    read: async (options) => {
      if (
        selectedIds.length > 4 ||
        new Set(selectedIds).size !== selectedIds.length
      )
        throw new ScenarioError(400, "INVALID_INPUT");
      return Promise.all(
        selectedIds.map((id) => api.run(workspaceId, id, options)),
      );
    },
  });
  const read = useScenarioRead({
    api,
    actor,
    scope: `workspace:${selection.factory_id}:${workspaceId}:${selection.scenario_id ?? "new"}:${selection.draft_cursor ?? ""}:${selection.run_cursor ?? ""}`,
    read: async (options) => {
      const workspace = await api.workspace(
        workspaceId,
        selection.factory_id,
        options,
      );
      const [drafts, runs, draft] = await Promise.all([
        api.listDrafts(
          workspaceId,
          { cursor: selection.draft_cursor, limit: 20 },
          options,
        ),
        api.listRuns(
          workspaceId,
          { cursor: selection.run_cursor, limit: 20 },
          options,
        ),
        selection.scenario_id
          ? api.draft(workspaceId, selection.scenario_id, options)
          : Promise.resolve(undefined),
      ]);
      return { workspace, drafts, runs, draft };
    },
  });
  const data = read.data;
  const fresh = sessionFresh && read.kind === "ready";
  const navigate = (patch: Partial<ScenarioSelection>) =>
    router.push(
      scenarioHref(selection.factory_id, workspaceId, {
        ...selection,
        ...patch,
      }),
      { scroll: false },
    );
  const comparisonRows = [
    ...new Map(
      [...(data?.runs.items ?? []), ...(comparisonReads.data ?? [])].map(
        (row) => [row.job_id, row],
      ),
    ).values(),
  ];
  const compareError =
    data && comparisonReads.kind === "ready"
      ? validateCompareSelection(selectedIds, comparisonRows)
      : undefined;
  const selectedSummary = comparisonRows.find(
    (run) => run.job_id === selection.run_id,
  );
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-blue-800">
            Scenario Planning / workspace
          </p>
          <h1 className="mt-2 break-words text-2xl font-semibold">
            {data?.workspace.name ?? "Saved workspace"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            SIMULATION ONLY · production state remains unchanged
          </p>
        </div>
        <button
          className="dss-secondary"
          disabled={!sessionFresh || read.kind === "loading"}
          onClick={read.refresh}
        >
          Refresh workspace
        </button>
      </header>
      {read.kind === "loading" ? (
        <AsyncState
          compact
          kind="loading"
          title={
            data
              ? "Refreshing — previous read shown; editing disabled"
              : "Loading immutable workspace"
          }
        />
      ) : null}
      {read.error ? (
        <ScenarioFailure error={read.error} retry={read.refresh} />
      ) : null}
      {data ? (
        <>
          <section
            className="space-y-4 rounded-lg border bg-white p-5"
            aria-label="Workspace baseline"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Pinned baseline</h2>
              <span className="text-sm text-amber-900">
                {data.workspace.stale
                  ? "Historical — viewing is allowed; no automatic rebase"
                  : "Matches current context"}
              </span>
            </div>
            <dl className="grid gap-4 text-sm lg:grid-cols-4">
              {[
                ["Snapshot", data.workspace.baseline.snapshot_id],
                ["Plan version", String(data.workspace.baseline.plan_version)],
                [
                  "Reference publication",
                  data.workspace.baseline.publication
                    ? `${data.workspace.baseline.publication.schedule_id} · revision ${data.workspace.baseline.publication.schedule_revision}`
                    : "No reference publication",
                ],
                [
                  "Engine / contract",
                  `${data.workspace.engine_version} / ${data.workspace.contract_version}`,
                ],
              ].map(([name, value]) => (
                <div className="min-w-0" key={name}>
                  <dt className="text-xs text-slate-500">{name}</dt>
                  <dd className="mt-2 break-all">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs leading-5 text-slate-500">
              The reference publication remains S1/P1 history. The computed
              baseline for each evaluation must use the same
              config/objectives/engine/sampling as its scenario. A reference
              schedule is not automatically feasible under new assumptions.
            </p>
          </section>
          <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside
              className="space-y-4 rounded-lg border bg-white p-4"
              aria-label="Saved scenario drafts"
            >
              <h2 className="font-semibold">Scenario drafts</h2>
              <Link
                className="dss-secondary"
                href={scenarioHref(selection.factory_id, workspaceId, {
                  ...selection,
                  scenario_id: undefined,
                })}
              >
                New draft
              </Link>
              {!data.drafts.items.length ? (
                <p className="text-sm text-slate-500">
                  No saved drafts on this page.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.drafts.items.map((draft) => (
                    <li key={draft.scenario_id}>
                      <Link
                        aria-current={
                          selection.scenario_id === draft.scenario_id
                            ? "page"
                            : undefined
                        }
                        className={`block rounded border p-3 text-sm ${selection.scenario_id === draft.scenario_id ? "border-blue-400 bg-blue-50" : ""}`}
                        href={scenarioHref(selection.factory_id, workspaceId, {
                          ...selection,
                          scenario_id: draft.scenario_id,
                        })}
                      >
                        <strong className="break-words">{draft.name}</strong>
                        <span className="mt-1 block text-xs text-slate-500">
                          Revision {draft.revision} · {draft.overrides.length}{" "}
                          assumptions
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {selection.draft_cursor ? (
                <Link
                  className="block text-sm text-blue-800 underline"
                  href={scenarioHref(selection.factory_id, workspaceId, {
                    ...selection,
                    draft_cursor: undefined,
                  })}
                >
                  First draft page
                </Link>
              ) : null}
              {data.drafts.next_cursor ? (
                <Link
                  className="block text-sm text-blue-800 underline"
                  href={scenarioHref(selection.factory_id, workspaceId, {
                    ...selection,
                    draft_cursor: data.drafts.next_cursor,
                  })}
                >
                  Next draft page
                </Link>
              ) : null}
            </aside>
            <div className="min-w-0 space-y-5">
              <BaselineEditor
                api={api}
                actor={actor}
                workspace={data.workspace}
                fresh={fresh}
              >
                {(snapshot, baselineFresh) => (
                  <>
                    <ScenarioEditor
                      key={data.draft?.scenario_id ?? "new"}
                      workspace={data.workspace}
                      snapshot={snapshot}
                      draft={data.draft}
                      api={api}
                      actor={actor}
                      fresh={baselineFresh}
                      refresh={read.refresh}
                      onSaved={(saved) => {
                        if (selection.scenario_id !== saved.scenario_id)
                          navigate({ scenario_id: saved.scenario_id });
                        else read.refresh();
                      }}
                    />
                    <RunReview
                      draft={data.draft}
                      snapshot={snapshot}
                      workspace={data.workspace}
                      management={["ADMIN", "ENGINEER"].includes(actor.role)}
                    />
                    <SensitivityInputs
                      key={`${workspaceId}:${selection.run_id ?? ""}:basis`}
                      workspace={data.workspace}
                      source={selectedSummary}
                      snapshot={snapshot}
                    />
                  </>
                )}
              </BaselineEditor>
              {data.workspace.current_head?.snapshot_id !==
                data.workspace.baseline.snapshot_id && data.draft ? (
                <section className="rounded-lg border bg-white p-5">
                  <h2 className="font-semibold">Saved historical draft</h2>
                  <p className="mt-3 text-sm">
                    {data.draft.name} · revision {data.draft.revision}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">
                    {data.draft.note || "No note supplied"}
                  </p>
                  <ul className="mt-3 space-y-2 text-sm">
                    {data.draft.overrides.map((override, i) => (
                      <li key={i} className="break-all">
                        {override.type} ·{" "}
                        {override.type === "TECHNICIAN_UNAVAILABLE"
                          ? override.technician_id
                          : override.maintenance_request_id}
                        <span className="mt-1 block text-slate-600">
                          {override.type === "MAINTENANCE_DURATION"
                            ? `${override.expected_duration_minutes} minutes`
                            : override.type === "DEFER_MAINTENANCE"
                              ? `Earliest start: ${override.earliest_start_at}`
                              : `${override.start_at} → ${override.end_at}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-4 grid gap-3 text-xs lg:grid-cols-3">
                    {weightNames.map((name) => (
                      <div key={name}>
                        <dt className="text-slate-500">
                          {name.replaceAll("_", " ")}
                        </dt>
                        <dd className="mt-1 font-mono">
                          {data.draft!.objective_weights[name]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-slate-500">
                    Reading these saved values does not substitute current
                    entities or enable editing without the immutable basis.
                  </p>
                </section>
              ) : null}
            </div>
          </div>
          <section
            className="space-y-4 rounded-lg border bg-white p-5"
            aria-label="Saved runs"
          >
            <h2 className="text-lg font-semibold">Saved runs and comparison</h2>
            <p className="text-sm text-slate-500">
              Choose one completed baseline and at most three completed
              scenarios. List rows are summaries; selecting a run reads
              persisted detail.
            </p>
            {data.runs.items.length ? (
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      {[
                        "Compare",
                        "Saved run",
                        "Status / attempt",
                        "Frozen source",
                        "Created (UTC)",
                      ].map((label) => (
                        <th key={label} className="p-3">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.runs.items.map((run) => (
                      <tr key={run.job_id}>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            aria-label={`Compare run ${run.job_id}`}
                            disabled={
                              !fresh ||
                              run.status !== "SUCCEEDED" ||
                              run.kind !== "RUN"
                            }
                            checked={selectedIds.includes(run.job_id)}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selectedIds, run.job_id]
                                : selectedIds.filter((id) => id !== run.job_id);
                              const error = validateCompareSelection(
                                next,
                                comparisonRows,
                              );
                              if (
                                error &&
                                (next.length > 4 ||
                                  next.filter(
                                    (id) =>
                                      comparisonRows.find(
                                        (job) => job.job_id === id,
                                      )?.source_scenario_id !== null,
                                  ).length > 3)
                              ) {
                                setSelectionError(error);
                                return;
                              }
                              setSelectionError("");
                              navigate({ compare: next });
                            }}
                          />
                        </td>
                        <td className="p-3">
                          <Link
                            className="font-mono text-xs text-blue-800 underline"
                            href={scenarioHref(
                              selection.factory_id,
                              workspaceId,
                              { ...selection, run_id: run.job_id },
                            )}
                          >
                            {run.source_scenario_id ? "Scenario" : "Baseline"}{" "}
                            {run.job_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="p-3">
                          {run.status}
                          <span className="mt-1 block text-xs text-slate-500">
                            Attempt {run.attempt}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          {run.source_scenario_id
                            ? `Draft ${run.source_scenario_id.slice(0, 8)} · revision ${run.source_revision}`
                            : "No overrides"}
                        </td>
                        <td className="p-3 text-xs tabular-nums">
                          {scenarioTime(run.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <AsyncState
                compact
                kind="empty"
                title="No saved runs"
                description="This workspace has no persisted run rows on this page. No baseline KPI or candidate schedule is fabricated."
              />
            )}
            <div className="flex flex-wrap justify-between gap-3">
              <p className="text-sm">{selectedIds.length}/4 selected</p>
              <div className="flex gap-3">
                {selection.run_cursor ? (
                  <Link
                    className="dss-secondary"
                    href={scenarioHref(selection.factory_id, workspaceId, {
                      ...selection,
                      run_cursor: undefined,
                    })}
                  >
                    First run page
                  </Link>
                ) : null}
                {data.runs.next_cursor ? (
                  <Link
                    className="dss-secondary"
                    href={scenarioHref(selection.factory_id, workspaceId, {
                      ...selection,
                      run_cursor: data.runs.next_cursor,
                    })}
                  >
                    Next run page
                  </Link>
                ) : null}
              </div>
            </div>
            {comparisonReads.error ? (
              <ScenarioFailure
                error={comparisonReads.error}
                retry={comparisonReads.refresh}
              />
            ) : null}
            {selectionError || compareError ? (
              <p role="alert" className="text-sm text-amber-900">
                {selectionError || compareError}
              </p>
            ) : null}
            <Dependency title="Comparison metrics unavailable">
              {selectedIds.length < 2
                ? "Select a baseline and a scenario to prepare comparison. "
                : "The selected runs stay in the URL across pages. "}
              The planning service has not provided supported comparison metrics
              or a tradeoff explanation.
            </Dependency>
          </section>
          {selection.run_id ? (
            <SelectedRun
              key={`${workspaceId}:${selection.run_id}`}
              api={api}
              actor={actor}
              workspace={data.workspace}
              runId={selection.run_id}
            />
          ) : (
            <Dependency title="Choose a saved run">
              Run progress, attempt, result availability and separate LIVE
              review appear after opening a saved run. Sensitivity requires a
              completed saved run.
            </Dependency>
          )}
          {selection.sensitivity_id ? (
            <Dependency title="Sensitivity job read unavailable">
              The URL retains sensitivity job{" "}
              <code className="break-all">{selection.sensitivity_id}</code>. The
              producer has not implemented the sensitivity read/result boundary.
              No different job or fixture is substituted.
            </Dependency>
          ) : null}
          <IdentityDetails
            values={{
              "Workspace ID": workspaceId,
              Factory: data.workspace.baseline.factory_id,
              "Basis snapshot": data.workspace.baseline.snapshot_id,
              "Basis hash": data.workspace.baseline.snapshot_hash,
              "Publication hash":
                data.workspace.baseline.publication?.schedule_hash,
              Creator: data.workspace.created_by,
              Created: scenarioTime(data.workspace.created_at),
              "Current observation": data.workspace.current_head?.snapshot_id,
              "Current plan": data.workspace.current_head?.plan_version,
              "Current head revision": data.workspace.current_head?.revision,
              "Baseline horizon":
                data.workspace.planning_config.horizon_minutes,
              "Sampling specification": "Not exposed by reviewed read DTO",
              "Model assumptions": "Awaiting reviewed engine result DTO",
            }}
          />
        </>
      ) : null}
    </div>
  );
}
