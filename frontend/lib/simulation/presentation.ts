import type { Simulation } from './types';

export type DemoBeat = 'factory' | 'incident' | 'workflow' | 'decision' | 'dispatch' | 'servicing' | 'repair' | 'comparison' | 'done';
export const beatView = { factory:'overview', incident:'overview', workflow:'agents', decision:'decision', dispatch:'overview', servicing:'overview', repair:'overview', comparison:'compare', done:'compare' } as const;
export const beatCopy: Record<DemoBeat,{title:string;description:string}> = {
  factory:{title:'1 · Simulator running',description:'Watch the factory until the first component failure.'},
  incident:{title:'2 · Incident detected',description:'A real simulator failure triggered the coordination workflow.'},
  workflow:{title:'3 · AI coordination',description:'State observation → registered policy → legal matching validation.'},
  decision:{title:'4 · Proposed decision',description:'Inspect the technician assignments. Auto demo will confirm this policy matching automatically.'},
  dispatch:{title:'5 · Technician dispatch',description:'Following the accepted matching until corrective service completes.'},
  servicing:{title:'5 · Technicians at work',description:'Assigned technicians are occupied; remaining service time comes from the simulator.'},
  repair:{title:'6 · Service completed',description:'The simulator recorded corrective service completion. Other machines may still need attention.'},
  comparison:{title:'7 · S / F comparison',description:'Finishing both trajectories under the same configuration and physical seed.'},
  done:{title:'Demo complete',description:'Actual costs and independent replay results are shown below.'},
};
export function afterBatch(beat: DemoBeat, session: Simulation): DemoBeat {
  if(session.status==='COMPLETE')return 'done';
  if(beat==='factory' && session.first_incident_tick!==null)return 'incident';
  if(beat==='incident' && session.status==='REVIEW')return 'workflow';
  if((beat==='dispatch'||beat==='servicing') && session.primary.records.at(-1)?.events.some(e=>e.type==='completion'&&e.kind==='CM'))return 'repair';
  if(beat==='dispatch' && session.primary.records.at(-1)?.events.some(e=>e.type==='start'))return 'servicing';
  return beat;
}
export function presentationAction(beat:DemoBeat):{delay:number;next?:DemoBeat;stopAt?:'incident'|'review'|'dispatch'|'repair'|'complete'} {
  switch(beat){
    case 'factory':return {delay:500,stopAt:'incident'};
    case 'incident':return {delay:2000,stopAt:'review'};
    case 'workflow':return {delay:2000,next:'decision'};
    case 'decision':return {delay:4000,next:'dispatch'};
    case 'dispatch':return {delay:350,stopAt:'dispatch'};
    case 'servicing':return {delay:1800,stopAt:'repair'};
    case 'repair':return {delay:3000,next:'comparison'};
    case 'comparison':return {delay:50,stopAt:'complete'};
    default:return {delay:0};
  }
}
