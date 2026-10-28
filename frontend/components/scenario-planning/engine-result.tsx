import type { EngineResult, Evaluation, Comparison } from "@/types/generated/scenario-planning";

export function MetricTable({ comparison }: { comparison: Comparison }) {
  return <div className="overflow-auto"><table className="w-full text-left text-sm" aria-label="Computed KPI comparison">
    <thead><tr>{["KPI", "Unit / preferred direction", "Reference", "Scenario", "Delta", "Reason"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
    <tbody>{comparison.metrics.map(metric => <tr key={metric.metric}>
      <td className="p-2">{metric.metric}</td><td>{metric.unit} / {metric.preferred_direction}</td>
      <td>{metric.baseline ?? "Unavailable"}</td><td>{metric.scenario ?? "Unavailable"}</td>
      <td>{metric.absolute_delta ?? "Unavailable"}</td><td>{metric.reason ?? metric.change}</td>
    </tr>)}</tbody></table><p className="mt-2 text-xs">Scores are relative to their own candidate set; cross-run score differences are not quality comparisons.</p></div>;
}

function EvaluationDetails({ value }: { value: Evaluation }) {
  const selected = value.candidates?.find(candidate => candidate.candidate_plan_id === value.selected_candidate_id);
  return <div className="space-y-3">
    <p>Outcome: <strong>{value.outcome}</strong>{value.partial ? " — partial result before deadline" : ""}</p>
    {value.diagnostics?.map((diagnostic, index) => <p key={index} role="status">{diagnostic.code}: {diagnostic.message}</p>)}
    {value.ranking ? <>
      <p className="break-all text-xs">Normalization reference: {value.ranking.normalization_reference_id} ({value.ranking.version})</p>
      <table className="w-full text-left text-sm" aria-label="Computed strategy ranking"><thead><tr><th>Strategy</th><th>Relative score</th><th>Weighted contributions</th><th>Ties</th></tr></thead>
        <tbody>{value.ranking.rows.map(row => <tr key={row.candidate_plan_id}><td>{row.strategy}</td><td>{row.score}</td>
          <td>{Object.entries(row.weighted_contributions).map(([key, amount]) => `${key}: ${amount}`).join("; ")}</td><td>{row.tied_with.length}</td></tr>)}</tbody></table>
      <p className="text-xs">Tie break: {value.ranking.tie_break.join(" → ")}</p>
    </> : null}
    {selected ? <div className="overflow-auto"><table className="w-full text-left text-sm" aria-label="Selected candidate schedule"><thead><tr><th>Machine</th><th>Task</th><th>Start</th><th>End</th></tr></thead>
      <tbody>{selected.schedule.assignments?.map(assignment => <tr key={assignment.assignment_id}>
        <td>{assignment.machine_id}</td><td>{assignment.maintenance_request_id ?? assignment.operation_id}</td><td>{assignment.start_at}</td><td>{assignment.end_at}</td>
      </tr>)}</tbody></table></div> : null}
  </div>;
}

export function EngineResultView({ result }: { result: EngineResult }) {
  if ("scenario" in result) return <section aria-label="Evaluated scenario" className="space-y-4">
    <EvaluationDetails value={result.scenario} />
    <MetricTable comparison={result.comparison} />
    <details><summary>Effective input and model assumptions</summary>
      <p className="break-all">Effective hash: {result.effective.effective_hash ?? "Infeasible input"}</p>
      <ul>{result.effective.diff.map((diff, index) => <li key={index}>{diff.target_id} / {diff.field}: {JSON.stringify(diff.before)} → {JSON.stringify(diff.after)}</li>)}</ul>
      <ul>{result.comparison.model_assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul>
      <p>Sampling {result.sampling.version}; seed {result.sampling.base_seed}; {result.sampling.sample_count} draws; {result.sampling.coupling}.</p>
    </details>
  </section>;
  if ("points" in result) return <section aria-label="Evaluated sensitivity" className="space-y-4">
    <p>Aggregate: {result.outcome}; source value: {result.baseline_value}</p>
    <p className="text-xs">Fixed: {result.fixed_inputs.join(", ")}</p>
    {result.points.map(point => <details key={point.value}><summary>Sample {point.value}: {point.status}</summary><EvaluationDetails value={point.evaluation} /><MetricTable comparison={point.comparison} /></details>)}
    {result.rank_change_intervals.length ? result.rank_change_intervals.map(interval => <p key={interval.lower_sample}>Rank change sampled between {interval.lower_sample} and {interval.upper_sample}: {interval.from_strategy} → {interval.to_strategy}. This is not an exact threshold.</p>) : <p>No rank change observed between adjacent feasible samples.</p>}
  </section>;
  return <p role="alert">Unsupported engine result.</p>;
}
