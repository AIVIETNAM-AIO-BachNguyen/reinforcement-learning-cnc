"use client";
import { useState } from "react";
import { EngineResultView } from "./engine-result";
import { useScenarioIntent } from "@/lib/scenario-planning/hooks";
import type { EnqueueRun } from "@/types/generated/scenario-planning";
import type { TokenUser } from "@/lib/auth";
import type { FactorySnapshot } from "@/types/generated/operations";
import type {
  Draft,
  EnqueueSensitivity,
  Job,
  Workspace,
} from "@/types/generated/scenario-planning";
import {
  scenarioError,
  type ScenarioClient,
  type ScenarioError,
} from "@/lib/scenario-planning/client";
import { validateSweep, weightNames } from "@/lib/scenario-planning/inputs";
import { useScenarioRead } from "@/lib/scenario-planning/hooks";
import {
  Dependency,
  Field,
  IdentityDetails,
  ScenarioFailure,
  scenarioInput,
} from "./frame";
import { DraftReview } from "./editor";
import { scenarioTime } from "@/components/pages/scenario-workspaces-page";

export function RunInspector({ job }: { job: Job }) {
  return (
    <section
      aria-label="Selected run"
      className="space-y-4 rounded-lg border bg-white p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {job.kind === "SENSITIVITY"
              ? "Sensitivity job"
              : job.source_scenario_id
                ? "Scenario run"
                : "No-overrides baseline run"}
          </h2>
          <p className="mt-2 text-sm">
            {job.status} · attempt {job.attempt}
            {job.source_revision
              ? ` · frozen draft revision ${job.source_revision}`
              : ""}
          </p>
        </div>
        <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-semibold">
          SIMULATION ONLY
        </span>
      </header>
      {job.status === "QUEUED" || job.status === "RUNNING" ? (
        <p role="status" className="text-sm text-blue-900">
          Waiting for authoritative worker progress. Polling uses backoff;
          reload only reads this saved job.
        </p>
      ) : job.status === "FAILED" ? (
        <div
          role="alert"
          className="rounded border border-rose-200 bg-rose-50 p-4 text-sm"
        >
          The job failed.{" "}
          {job.error_code === "PLANNING_TIMEOUT" ||
          job.error_code === "SCENARIO_JOB_TIMEOUT"
            ? "Its deadline was reached."
            : "No successful result is substituted."}{" "}
          Previous attempts are retained by the server; this API does not expose
          attempt history or a public retry-attempt command.
        </div>
      ) : (
        <p className="text-sm">
          The job reports completion. Feasibility, KPI, strategy ranking and
          schedule require the reviewed engine result DTO.
        </p>
      )}
      <dl className="grid gap-4 text-sm lg:grid-cols-4">
        {[
          ["Engine", job.engine_version],
          ["Contract", job.contract_version],
          ["Started", scenarioTime(job.started_at)],
          ["Completed", scenarioTime(job.completed_at)],
          ["Deadline", scenarioTime(job.deadline_at)],
        ].map(([label, value]) => (
          <div className="min-w-0" key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-2 break-all tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {job.points.length ? (
        <div className="overflow-auto" aria-label="Per-point progress">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                {[
                  "Point",
                  "Requested value",
                  "Transport outcome",
                  "Result",
                ].map((label) => (
                  <th key={label} className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {job.points.map((point) => (
                <tr key={point.point_index}>
                  <td className="p-3 tabular-nums">{point.point_index}</td>
                  <td className="p-3 tabular-nums">
                    {point.value ?? "Not provided"}
                  </td>
                  <td className="p-3">
                    <span
                      className={
                        ["FAILED", "TIMEOUT", "NO_FEASIBLE_PLAN"].includes(
                          point.status,
                        )
                          ? "text-amber-900"
                          : "text-slate-700"
                      }
                    >
                      {point.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {point.result
                      ? "Persisted engine result"
                      : "No result supplied"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Every failed, timeout and infeasible point remains visible.
            Aggregate outcome, KPI/units and fixed-input metadata are not
            inferred from transport status.
          </p>
        </div>
      ) : null}
      {job.result ? <EngineResultView result={job.result} /> : <Dependency title="Evaluated result unavailable">
        A supported planning result has not been provided. KPI, constraints,
        ranking explanation, candidate schedule, model assumptions and sampling
        uncertainty are unavailable.
      </Dependency>}
      <IdentityDetails
        values={{
          "Job ID": job.job_id,
          "Workspace ID": job.workspace_id,
          "Input hash": job.input_hash,
          "Source scenario": job.source_scenario_id,
          "Frozen source revision": job.source_revision,
          "Source run": job.source_run_id,
        }}
      />
    </section>
  );
}

export function RunReview({
  draft,
  snapshot,
  workspace,
  management,
  api, actor, onAccepted,
}: {
  draft?: Draft;
  snapshot?: FactorySnapshot;
  workspace: Workspace;
  management: boolean;
  api?: ScenarioClient; actor?: TokenUser; onAccepted?: (job: Job) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-4 rounded-lg border bg-white p-5">
      <h2 className="text-lg font-semibold">Run immutable inputs</h2>
      <p className="text-sm text-slate-600">
        Review a saved draft revision before enqueue. Edits after enqueue must
        not change a frozen run.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className="dss-secondary"
          disabled={!draft || !snapshot}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          Review saved run input
        </button>
        {management ? (
          <>
            {api && actor && onAccepted ? <RunActions api={api} actor={actor} workspace={workspace} draft={draft} onAccepted={onAccepted} /> : <span>Run service unavailable</span>}
          </>
        ) : (
          <span className="text-sm text-slate-500">Read-only role</span>
        )}
      </div>
      {open && draft && snapshot ? (
        <DraftReview draft={draft} snapshot={snapshot} workspace={workspace} />
      ) : null}
      {!api && <Dependency title="Run execution unavailable">
        The planning service is not ready to execute Scenario jobs. You can save
        and review assumptions; no run is submitted. Refreshing or reloading
        only reads saved records.
      </Dependency>}
    </section>
  );
}

function RunActions({ api, actor, workspace, draft, onAccepted }: { api: ScenarioClient; actor: TokenUser; workspace: Workspace; draft?: Draft; onAccepted: (job: Job) => void }) {
  const intent = useScenarioIntent<EnqueueRun, Job>({ api, actor, scope: `enqueue:${workspace.workspace_id}`,
    send: (body, options) => api.enqueueRun(workspace.workspace_id, body, options), onAccepted });
  return <div className="flex flex-wrap gap-3">
    <button className="dss-secondary" disabled={intent.unresolved} onClick={() => intent.start({kind: "BASELINE"})}>Run baseline</button>
    <button className="dss-primary" disabled={!draft || intent.unresolved} onClick={() => draft && intent.start({kind: "SCENARIO", scenario_id: draft.scenario_id, expected_revision: draft.revision})}>Run saved scenario</button>
    {intent.state.error ? <ScenarioFailure error={intent.state.error} /> : null}
    {intent.state.kind === "uncertain" ? <button onClick={intent.retry}>Retry same run request</button> : null}
    {intent.state.kind === "rejected" ? <button onClick={intent.reviewed}>Review new run request</button> : null}
  </div>;
}

export function SensitivityInputs({
  workspace,
  source,
  snapshot,
  api, actor, onAccepted,
}: {
  workspace: Workspace;
  source?: Job;
  snapshot?: FactorySnapshot;
  api?: ScenarioClient; actor?: TokenUser; onAccepted?: (job: Job) => void;
}) {
  const [type, setType] = useState<EnqueueSensitivity["axis"]["type"]>(
    "MAINTENANCE_DURATION",
  );
  const [target, setTarget] = useState(
    snapshot?.maintenance_requests?.[0]?.maintenance_request_id ?? "",
  );
  const [weight, setWeight] =
    useState<(typeof weightNames)[number]>("reliability");
  const [values, setValues] = useState([30, 60, 90, 120, 150]);
  const [review, setReview] = useState(false);
  const [error, setError] = useState<ScenarioError>();
  const complete = source?.status === "SUCCEEDED" && source.kind === "RUN";
  return (
    <section
      aria-label="Sensitivity analysis"
      className="space-y-5 rounded-lg border bg-white p-5"
    >
      <h2 className="text-lg font-semibold">Sensitivity analysis</h2>
      <p className="text-sm text-slate-600">
        One axis, at most seven unique bounded values. Default: five samples.
        Results must preserve infeasible gaps and describe sampled rank-change
        intervals.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            validateSweep(
              type === "MAINTENANCE_DURATION"
                ? {
                    type,
                    maintenance_request_id: target,
                    values: values as [number, ...number[]],
                  }
                : { type, weight, values: values as [number, ...number[]] },
              snapshot,
            );
            setError(undefined);
            setReview(true);
          } catch (failure: unknown) {
            setError(scenarioError(failure));
          }
        }}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Sweep parameter">
            <select
              className={scenarioInput}
              value={type}
              onChange={(event) => {
                const next = event.target.value as typeof type;
                setType(next);
                setValues(
                  next === "OBJECTIVE_WEIGHT"
                    ? [0, 0.5, 1, 2, 4]
                    : [30, 60, 90, 120, 150],
                );
                setReview(false);
              }}
            >
              <option value="MAINTENANCE_DURATION">
                Maintenance duration (minutes)
              </option>
              <option value="OBJECTIVE_WEIGHT">One objective weight</option>
            </select>
          </Field>
          {type === "MAINTENANCE_DURATION" ? (
            <Field label="Baseline maintenance target">
              <select
                className={scenarioInput}
                required
                disabled={!snapshot}
                value={target}
                onChange={(event) => {
                  setTarget(event.target.value);
                  setReview(false);
                }}
              >
                <option value="">Choose a pinned baseline request</option>
                {snapshot?.maintenance_requests?.map((item) => (
                  <option
                    value={item.maintenance_request_id}
                    key={item.maintenance_request_id}
                  >
                    {item.machine_id} · {item.maintenance_request_id}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Objective weight">
              <select
                className={scenarioInput}
                value={weight}
                onChange={(event) => {
                  setWeight(event.target.value as typeof weight);
                  setReview(false);
                }}
              >
                {weightNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <fieldset className="grid gap-3 lg:grid-cols-7">
          <legend className="mb-3 text-sm font-medium">
            Explicit sample values (
            {type === "MAINTENANCE_DURATION"
              ? "minutes, 1–43200"
              : "raw weight, 0–1000000"}
            )
          </legend>
          {values.map((value, index) => (
            <Field label={`Point ${index + 1}`} key={index}>
              <input
                required
                aria-label={`Sensitivity point ${index + 1}`}
                className={scenarioInput}
                type="number"
                min={type === "MAINTENANCE_DURATION" ? 1 : 0}
                max={type === "MAINTENANCE_DURATION" ? 43200 : 1e6}
                step="any"
                value={Number.isFinite(value) ? value : ""}
                onChange={(event) => {
                  setValues((old) =>
                    old.map((item, i) =>
                      i === index ? event.target.valueAsNumber : item,
                    ),
                  );
                  setReview(false);
                }}
              />
            </Field>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button
            className="dss-secondary"
            type="button"
            disabled={values.length >= 7}
            onClick={() => {
              setValues((old) => [...old, NaN]);
              setReview(false);
            }}
          >
            Add sample
          </button>
          <button
            className="dss-secondary"
            type="button"
            disabled={values.length <= 1}
            onClick={() => {
              setValues((old) => old.slice(0, -1));
              setReview(false);
            }}
          >
            Remove last sample
          </button>
          <button
            className="dss-secondary"
            type="submit"
            disabled={
              !complete || (type === "MAINTENANCE_DURATION" && !snapshot)
            }
          >
            Review sweep inputs
          </button>
          {api && actor && onAccepted && source && review ? <SweepAction api={api} actor={actor} workspace={workspace} source={source} onAccepted={onAccepted}
            axis={type === "MAINTENANCE_DURATION" ? {type, maintenance_request_id: target, values: values as [number, ...number[]]} : {type, weight, values: values as [number, ...number[]]}} /> : null}
        </div>
      </form>
      {error ? <ScenarioFailure error={error} /> : null}
      {review ? (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
          <p>
            Axis: {type === "OBJECTIVE_WEIGHT" ? weight : target}. Requested
            values: {values.join(", ")}. Source saved run:{" "}
            <code className="break-all">{source?.job_id}</code>.
          </p>
          <p>
            Workspace config is immutable:{" "}
            {workspace.planning_config.simulation_runs} MC draws, seed{" "}
            {workspace.planning_config.base_seed}, engine{" "}
            {workspace.engine_version}. Frozen run overrides/objectives/sampling
            are not exposed by the current read DTO, so fixed inputs cannot yet
            be confirmed.
          </p>
          <p>
            {type === "OBJECTIVE_WEIGHT"
              ? "The engine must rerank one candidate set/KPI/normalization reference while retaining other weights. No KPI rerun or frontend normalization."
              : "The engine must replan and validate each physical sample; failures must not borrow baseline KPI."}
          </p>
        </div>
      ) : null}
      <Dependency title="Sensitivity results unavailable">
        The sensitivity service has not provided an evaluated sample series.
        Chart, baseline marker, diagnostics and sampled rank-change intervals
        will appear with a supported result. Missing or failed points will
        remain gaps.
      </Dependency>
    </section>
  );
}

function SweepAction({api, actor, workspace, source, axis, onAccepted}: {api: ScenarioClient; actor: TokenUser; workspace: Workspace; source: Job; axis: EnqueueSensitivity["axis"]; onAccepted: (job: Job) => void}) {
  const intent = useScenarioIntent<EnqueueSensitivity, Job>({api, actor, scope: `sweep:${workspace.workspace_id}:${source.job_id}`,
    send: (body, options) => api.enqueueSensitivity(workspace.workspace_id, body, options), onAccepted});
  return <div><button type="button" className="dss-primary" disabled={intent.unresolved || !["ADMIN", "ENGINEER"].includes(actor.role)} onClick={() => intent.start({source_run_id: source.job_id, axis})}>Start sensitivity job</button>
    {intent.state.error ? <ScenarioFailure error={intent.state.error} /> : null}
    {intent.state.kind === "uncertain" ? <button type="button" onClick={intent.retry}>Retry same sensitivity request</button> : null}
    {intent.state.kind === "rejected" ? <button type="button" onClick={intent.reviewed}>Review new sensitivity request</button> : null}</div>;
}

export function LiveHandoffReview({
  workspace,
  source,
  api,
  actor,
}: {
  workspace: Workspace;
  source?: Job;
  api: ScenarioClient;
  actor: TokenUser;
}) {
  const [reviewing, setReviewing] = useState(false);
  const management = ["ADMIN", "ENGINEER"].includes(actor.role);
  const eligibleSource =
    source?.kind === "RUN" &&
    source.status === "SUCCEEDED" &&
    source.source_scenario_id !== null;
  return (
    <section className="space-y-4 rounded-lg border bg-white p-5">
      <h2 className="text-lg font-semibold">Evaluate LIVE separately</h2>
      <p className="text-sm text-slate-600">
        A completed saved scenario may hand off to a new LIVE case, requiring a
        new planner result, recommendation review and approval. Simulation
        candidates and schedules are never reused for publication.
      </p>
      {management ? (
        <button
          className="dss-secondary"
          disabled={!eligibleSource}
          onClick={() => setReviewing((value) => !value)}
          aria-expanded={reviewing}
        >
          Review LIVE handoff
        </button>
      ) : (
        <p className="text-sm text-slate-500">
          Your role can read analysis but cannot create a LIVE evaluation.
        </p>
      )}
      {reviewing && eligibleSource ? (
        <LiveContext
          workspace={workspace}
          source={source!}
          api={api}
          actor={actor}
        />
      ) : null}
      {source?.result && "live_mapping" in source.result && !source.result.live_mapping.supported ?
        <p role="note">LIVE handoff unavailable: {source.result.live_mapping.reasons.join("; ")}</p> : null}
    </section>
  );
}
function LiveContext({
  workspace,
  source,
  api,
  actor,
}: {
  workspace: Workspace;
  source: Job;
  api: ScenarioClient;
  actor: TokenUser;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [created, setCreated] = useState<string>();
  const intent = useScenarioIntent<import("@/types/generated/scenario-planning").LiveEvaluation, import("@/types/generated/scenario-planning").LiveCreated>({api, actor,
    scope: `live:${workspace.workspace_id}:${source.job_id}`, send: (body, options) => api.evaluateLive(workspace.workspace_id, body, options),
    onAccepted: result => setCreated(result.decision_case_id)});
  const current = useScenarioRead({
    api,
    actor,
    scope: `live-context:${workspace.workspace_id}:${source.job_id}`,
    read: (options) =>
      api.currentContext(workspace.baseline.factory_id, options),
  });
  return (
    <div className="space-y-4 border-t pt-4">
      {current.kind === "loading" ? (
        <p role="status">Reading current authorized context…</p>
      ) : null}
      {current.error ? (
        <ScenarioFailure error={current.error} retry={current.refresh} />
      ) : null}
      {current.data ? (
        <>
          <dl className="grid gap-4 text-sm lg:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Pinned analysis basis</dt>
              <dd className="mt-2 break-all">
                {workspace.baseline.snapshot_id} · plan{" "}
                {workspace.baseline.plan_version}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Current context</dt>
              <dd className="mt-2 break-all">
                {current.data.head.snapshot_id} · plan{" "}
                {current.data.head.plan_version} · head revision{" "}
                {current.data.head.revision}
              </dd>
            </div>
          </dl>
          {workspace.stale ||
          current.data.head.snapshot_id !== workspace.baseline.snapshot_id ||
          current.data.head.plan_version !== workspace.baseline.plan_version ? (
            <p role="alert" className="text-sm text-amber-900">
              Analysis basis is stale. Re-evaluation/review is required;
              supplying newer tokens will not rebase this scenario.
            </p>
          ) : null}
          <label className="block text-sm">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={intent.unresolved} className="mr-2" />
            Create a new LIVE case with the reviewed weights and supported maintenance bounds. Human approval is still required.
          </label>
        </>
      ) : null}
      <button className="dss-primary" disabled={!confirmed || intent.unresolved || !current.data || workspace.stale || current.data.head.snapshot_id !== workspace.baseline.snapshot_id || current.data.head.plan_version !== workspace.baseline.plan_version || !source.result || !("live_mapping" in source.result) || !source.result.live_mapping.supported}
        onClick={() => current.data && intent.start({source_run_id: source.job_id, confirmation: true, expected_head: current.data.head})}>
        Evaluate LIVE
      </button>
      {intent.state.error ? <ScenarioFailure error={intent.state.error} /> : null}
      {intent.state.kind === "uncertain" ? <button onClick={intent.retry}>Retry same LIVE request</button> : null}
      {intent.state.kind === "rejected" ? <button onClick={() => {intent.reviewed(); setConfirmed(false); current.refresh();}}>Review current LIVE context</button> : null}
      {created ? <p>New LIVE case: <a className="underline" href={`/operations/recommendations?factory_id=${encodeURIComponent(workspace.baseline.factory_id)}&caseId=${encodeURIComponent(created)}`}>{created}</a></p> : null}
    </div>
  );
}
