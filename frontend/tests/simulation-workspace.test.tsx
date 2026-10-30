import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoWorkspace } from '@/components/simulation/demo-workspace';
import { ComparisonView } from '@/components/simulation/comparison-view';
import { researchRequest } from '@/lib/research-api/client';
import type { Simulation } from '@/lib/simulation/types';
import type { Episode } from '@/types/generated/jcst';
import fixture from '../../contracts/jcst/v1/fixtures/engineering-bundle.json';
vi.mock('@/components/app-shell',()=>({AppShell:({children}:{children:ReactNode})=><>{children}</>}));
vi.mock('@/lib/research-api/client',()=>({researchRequest:vi.fn()}));
const capabilities={learned_releases:[{arm:'S',case_id:'base',available:true},{arm:'F',case_id:'base',available:true}]};
function session():Simulation {
  const e=fixture.episodes[0] as unknown as Episode;const state=e.records[0].before;
  const lane=(controller:string)=>({controller,state,records:[],total_cost:0,controlled_cost:0,tail_cost:0,failures:0,unavailable_machine_ticks:0,technician_busy_ticks:0,overrides:0});
  return {id:'session-1',revision:6,case_id:'base',physical_seed:'990000001',mode:'incident',horizon:48,tail:16,source_commit:'c577b6be',config:e.config,releases:{S:{release_id:'S-root0-96k',sha256:'abc'},F:{release_id:'F-root0-96k',sha256:'def'}},primary:lane('S'),baseline:lane('F'),status:'REVIEW',activated:true,first_incident_tick:5,pending:{tick:0,action:[[0,0,0]],baseline_action:[],catalogue:[[],[[0,0,0]]]},workflow:[],decisions:[]};
}
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();window.history.replaceState(null,'','/overview');});
describe('live simulation workflow',()=>{
  it('restores a pending decision, keeps it frozen, then submits approval against its persisted revision',async()=>{
    const s=session();
    vi.mocked(researchRequest).mockImplementation(async(path,options)=>{
      if(path==='/capabilities')return capabilities as never;
      if(path.endsWith('/commands'))return {...s,revision:7,status:'RUNNING',pending:null,primary:{...s.primary,state:{...s.primary.state,tick:1}}} as never;
      return s as never;
    });
    render(<DemoWorkspace view="decision" initialId="session-1"/>);
    expect(await screen.findByText('Registered policy S recommends')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Run simulator'})).toBeDisabled();
    expect(vi.mocked(researchRequest).mock.calls.filter(([p])=>p.endsWith('/commands'))).toHaveLength(0);
    await userEvent.click(screen.getByRole('button',{name:'Approve & dispatch'}));
    await waitFor(()=>expect(researchRequest).toHaveBeenCalledWith('/demo/sessions/session-1/commands',expect.objectContaining({body:expect.objectContaining({revision:6,command:'approve'})})));
    expect(await screen.findByText('No pending decision')).toBeInTheDocument();
    expect(sessionStorage.getItem('mcc-demo-session')).toBe('session-1');
  });
  it('shows runtime unavailability and does not silently use fixture policies',async()=>{
    vi.mocked(researchRequest).mockRejectedValue(new Error('Policy runtime unavailable'));
    render(<DemoWorkspace/>);
    expect(await screen.findByText(/Learned runtime is unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Create simulation'})).toBeDisabled();
  });
  it('starts a real session via API rather than fabricating a local incident',async()=>{
    vi.mocked(researchRequest).mockImplementation(async(path)=>path==='/capabilities'?capabilities as never:{...session(),status:'RUNNING',pending:null} as never);
    render(<DemoWorkspace/>);
    const button=await screen.findByRole('button',{name:'Create simulation'});
    await waitFor(()=>expect(button).toBeEnabled());await userEvent.click(button);
    await waitFor(()=>expect(researchRequest).toHaveBeenCalledWith('/demo/sessions',expect.objectContaining({body:{case:'base',seed:'990000001',mode:'incident',primary:'S',baseline:'F'}})));
    expect(await screen.findByRole('button',{name:'Run simulator'})).toBeEnabled();
  });
  it('keeps a human-overridden trajectory distinct and shows whichever policy has lower actual cost',()=>{
    const s=session();s.primary.overrides=1;s.primary.total_cost=150;s.baseline.total_cost=100;
    render(<ComparisonView session={s}/>);
    expect(screen.getByText('F has lower cost in this trajectory')).toBeInTheDocument();
    expect(screen.getByText(/not an automatic-policy comparison/)).toBeInTheDocument();
    expect(screen.getByText('Partial trajectory')).toBeInTheDocument();
    expect(screen.getByText(/separate from SE1 evaluation/)).toBeInTheDocument();
  });
  it('starts the guided demo with one click and pauses before sending the next command',async()=>{
    const s={...session(),status:'RUNNING',pending:null,first_incident_tick:null} as Simulation;
    vi.mocked(researchRequest).mockImplementation(async(path)=>path==='/capabilities'?capabilities as never:s as never);
    render(<DemoWorkspace/>);
    const auto=await screen.findByRole('button',{name:'Auto demo'});
    await waitFor(()=>expect(auto).toBeEnabled());await userEvent.click(auto);
    expect(await screen.findByText('1 · Simulator running')).toBeInTheDocument();
    expect(screen.getByText('Policy confirmation is automatic in this simulation demo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Pause auto demo'}));
    await new Promise(resolve=>setTimeout(resolve,650));
    expect(vi.mocked(researchRequest).mock.calls.filter(([path])=>path.endsWith('/commands'))).toHaveLength(0);
    expect(screen.getByRole('button',{name:'Resume auto demo'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Run simulator'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Manual control'}));
    expect(screen.getByRole('button',{name:'Run simulator'})).toBeEnabled();
  });

});

describe('machine inspection',()=>{
  it('opens scenario context with live condition, then Escape restores focus',async()=>{
    const {FleetView}=await import('@/components/simulation/fleet-view');const s=session();
    const failed=structuredClone(s.primary);failed.state.components[2][1].failed=true;
    render(<FleetView lane={failed} config={s.config}/>);
    const trigger=screen.getByRole('button',{name:'Inspect machine M3'});await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('DEMO-PH-001')).toBeInTheDocument();
    expect(screen.getByText('Line P1 · Pump housing')).toBeInTheDocument();
    expect(screen.getAllByText('Zone B · Bay B1').length).toBeGreaterThan(0);
    expect(screen.getByText(/Factory context below is an illustrative/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(trigger).toHaveFocus();
  });
});
