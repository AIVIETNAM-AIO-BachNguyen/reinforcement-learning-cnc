import type { Simulation } from '@/lib/simulation/types';
import { FleetView } from './fleet-view';

export function ComparisonView({ session }: { session: Simulation }) {
  const a = session.primary; const b = session.baseline;
  const delta = a.total_cost - b.total_cost;
  const label = `${a.controller}${a.overrides ? ' + human override' : ''}`;
  const series = [a,b].map(lane => { let total=0; return [{x:0,y:0},...lane.records.map(r=>({x:r.tick+1,y:total+=r.cost}))]; });
  const max = Math.max(1,...series.flatMap(s=>s.map(p=>p.y)));
  return <div className="sim-comparison">
    <section className="sim-panel"><div className="sim-panel-heading"><div><h2>Controller comparison</h2><p>Same configuration, seed, physical noise and 48 + 16 interval window.</p></div><span className="evidence-badge">{session.status === 'COMPLETE' ? 'Completed episode' : 'Partial trajectory'}</span></div>
      {session.mode === 'incident' && <p className="sim-inline-note">Incident response: both controllers share a WAIT prelude until the first failure. This is an engineering demonstration, separate from SE1 evaluation.</p>}
      {a.overrides > 0 && <p className="sim-inline-note">{a.overrides} human override(s). This trajectory represents {label}; it is not an automatic-policy comparison.</p>}
      <table className="sim-metrics-table"><thead><tr><th>Measure</th><th>{label}</th><th>{b.controller}</th></tr></thead><tbody>
        {[['Total simulation cost',a.total_cost,b.total_cost],['Controlled H cost',a.controlled_cost,b.controlled_cost],['Fixed-risk tail cost',a.tail_cost,b.tail_cost],['Component failure events',a.failures,b.failures],['Unavailable machine-ticks',a.unavailable_machine_ticks,b.unavailable_machine_ticks],['Technician busy-ticks',a.technician_busy_ticks,b.technician_busy_ticks]].map(([name,x,y])=><tr key={name}><th>{name}</th><td>{x}</td><td>{y}</td></tr>)}
      </tbody></table>
      <div className="sim-delta"><span>Cost difference · {label} − {b.controller}</span><strong>{delta > 0 ? '+' : ''}{delta.toFixed(0)}</strong><span>{delta < 0 ? `${label} has lower cost in this trajectory` : delta > 0 ? `${b.controller} has lower cost in this trajectory` : 'Equal cost so far'}</span></div>
      {session.status === 'COMPLETE' && session.audits && <div className="sim-replay-verification"><span className="evidence-badge">Primary physical replay: {session.audits.primary.status} · {session.audits.primary.records} records</span><span className="evidence-badge">Baseline physical replay: {session.audits.baseline.status} · {session.audits.baseline.records} records</span></div>}
      <p className="sim-footnote">One engineering seed; no statistical superiority claim. Unavailable machine-ticks includes both breakdown and service. Busy-ticks measures occupancy, not decision quality.</p>
    </section>
    <figure className="sim-panel sim-cost-chart"><figcaption><strong>Cumulative cost</strong><span><i /> {label} <i className="baseline" /> {b.controller}</span></figcaption><svg viewBox="0 0 880 235" role="img" aria-label="Actual cumulative simulation cost, primary and baseline"><path d="M45 15 V200 H850" fill="none" stroke="#cad0d9" />{[0,.5,1].map(t=><g key={t}><text x="35" y={204-180*t} textAnchor="end" fontSize="11" fill="#626873">{(max*t).toFixed(0)}</text><path d={`M45 ${200-180*t} H850`} stroke="#eeeff1" /></g>)}{series.map((rows,i)=><polyline key={i} fill="none" stroke={i ? '#8c5ab5' : '#266df0'} strokeWidth="2.5" strokeDasharray={i ? '6 4' : undefined} points={rows.map(p=>`${45+805*p.x/64},${200-180*p.y/max}`).join(' ')} />)}<text x="45" y="225" fontSize="11">0</text><text x="850" y="225" fontSize="11" textAnchor="end">64 physical ticks</text></svg></figure>
    <div className="sim-comparison-fleets">{[a,b].map((lane,i)=><section className="sim-panel" key={i}><div className="sim-panel-heading"><h2>{i ? lane.controller : label} · tick {lane.state.tick}</h2><strong>{lane.total_cost} cost</strong></div><FleetView lane={lane} config={session.config} compact /></section>)}</div>
  </div>;
}
