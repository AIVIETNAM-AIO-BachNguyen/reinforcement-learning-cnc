import { describe, expect, it } from 'vitest';
import { afterBatch, beatView, presentationAction } from '@/lib/simulation/presentation';
import type { Simulation } from '@/lib/simulation/types';
const boundary=(changes:Partial<Simulation>={}):Simulation=>({status:'RUNNING',first_incident_tick:null,primary:{records:[]},...changes} as Simulation);
describe('guided presentation milestones',()=>{
  it('only announces incidents, review and completed repairs returned by the simulator',()=>{
    expect(afterBatch('factory',boundary())).toBe('factory');
    expect(afterBatch('factory',boundary({first_incident_tick:5}))).toBe('incident');
    expect(afterBatch('incident',boundary())).toBe('incident');
    expect(afterBatch('incident',boundary({status:'REVIEW'}))).toBe('workflow');
    const started=boundary();started.primary.records=[{events:[{type:'start',kind:'CM'}]}] as Simulation['primary']['records'];
    expect(afterBatch('dispatch',started)).toBe('servicing');
    expect(afterBatch('servicing',boundary())).toBe('servicing');
    const repaired=boundary();repaired.primary.records=[{events:[{type:'completion',kind:'CM'}]}] as Simulation['primary']['records'];
    expect(afterBatch('servicing',repaired)).toBe('repair');
    expect(afterBatch('factory',boundary({status:'COMPLETE'}))).toBe('done');
  });
  it('holds the decision visibly before automatic dispatch and ends on the comparison',()=>{
    expect(beatView.workflow).toBe('agents');expect(beatView.decision).toBe('decision');
    expect(presentationAction('decision')).toEqual({delay:4000,next:'dispatch'});
    expect(presentationAction('servicing').stopAt).toBe('repair');
    expect(beatView.done).toBe('compare');expect(presentationAction('done').stopAt).toBeUndefined();
  });
});
