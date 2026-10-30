import { X, MapPin } from 'lucide-react';
import { ReviewDialog } from '@/components/research/review-dialog';
import type { Config } from '@/types/generated/jcst';
import type { Lane, Matching } from '@/lib/simulation/types';

// Presentation context only. These labels do not enter JCST policy observations.
export const demoMachines = [
  { name:'CNC turning center', operation:'Rough turning', product:'Pump housing', batch:'DEMO-PH-001', position:'Zone A · Bay A1', x:0,y:0 },
  { name:'CNC milling center', operation:'Precision milling', product:'Pump housing', batch:'DEMO-PH-001', position:'Zone A · Bay A2', x:1,y:0 },
  { name:'CNC finishing center', operation:'Finishing & inspection', product:'Pump housing', batch:'DEMO-PH-001', position:'Zone B · Bay B1', x:2,y:1 },
];
export function MachineDetail({machine,lane,config,proposal,onClose}:{machine:number;lane:Lane;config:Config;proposal:Matching;onClose:()=>void}) {
  const info=demoMachines[machine];const components=lane.state.components[machine];
  const job=lane.state.jobs.find(j=>j?.machine===machine);const next=proposal.find(a=>a[0]===machine);
  const status=job?'In service':components.some(c=>c.failed)?'Breakdown':'Working';
  const title=`machine-detail-${machine}`;
  return <ReviewDialog labelledBy={title} busy={false} onClose={onClose}><div className="sim-machine-detail">
    <header><div><p className="research-eyebrow">Machine M{machine+1} · {status} · tick {lane.state.tick}</p><h2 id={title}>{info?.name ?? `Machine M${machine+1}`}</h2></div><button className="sim-button" aria-label="Close machine details" onClick={onClose}><X size={17} aria-hidden="true"/></button></header>
    <p className="sim-inline-note">Factory context below is an illustrative demo scenario. Line, batch and location do not affect the JCST simulator or policy.</p>
    <dl className="sim-machine-facts"><div><dt>Production line</dt><dd>{info?'Line P1 · Pump housing':'Not configured'}</dd></div><div><dt>Operation</dt><dd>{info?.operation??'Not configured'}</dd></div><div><dt>Assigned batch</dt><dd>{info?.batch??'Not configured'}</dd></div><div><dt>Product</dt><dd>{info?.product??'Not configured'}</dd></div><div><dt>Factory location</dt><dd>{info?.position??'Not configured'}</dd></div><div><dt>Current service</dt><dd>{job?`T${job.technician+1} · ${job.kind} · ${job.remaining} ticks left`:next?`Proposed T${next[2]+1} → C${next[1]+1}`:'No technician assigned'}</dd></div></dl>
    <h3>Illustrative production sequence</h3><ol className="sim-production-chain">{demoMachines.map((m,i)=><li aria-current={i===machine?'step':undefined} key={m.name}>M{i+1}<span>{m.operation}</span></li>)}</ol>
    <h3><MapPin size={14} aria-hidden="true"/> Factory position · schematic</h3><div className="sim-factory-map" aria-label="Illustrative factory layout">{demoMachines.map((m,i)=><div key={m.name} className={i===machine?'is-selected':''} style={{gridColumn:m.x+1,gridRow:m.y+1}}>M{i+1}<span>{m.position}</span></div>)}</div>
    <h3>Live simulator components</h3><table className="sim-metrics-table"><thead><tr><th>Component</th><th>Condition</th><th>Age</th><th>Qualified service durations</th></tr></thead><tbody>{components.map((c,i)=><tr key={i}><th>C{i+1}</th><td>{c.failed?'FAILED':'Healthy'}</td><td>{c.age} ticks</td><td>{config.duration[machine][i].map((d,j)=>`T${j+1}: ${d?`${d} ticks`:'not qualified'}`).join(' · ')}</td></tr>)}</tbody></table>
    <h3>Recent machine events</h3><ul className="sim-event-list">{lane.records.flatMap(r=>r.events).filter(e=>e.machine===machine&&e.type!=='occupancy').slice(-6).reverse().map((e,i)=><li key={i}>t{e.tick} · {e.type} · C{e.component+1}{e.technician==null?'':` · T${e.technician+1}`}</li>)}</ul>{!lane.records.some(r=>r.events.some(e=>e.machine===machine&&e.type!=='occupancy'))&&<p className="sim-footnote">No recorded events for this machine yet.</p>}
  </div></ReviewDialog>;
}
