"use client";
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, RotateCcw, ArrowRight, Activity, GitCompareArrows, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { researchRequest } from '@/lib/research-api/client';
import type { Simulation, Matching } from '@/lib/simulation/types';
import { afterBatch, beatCopy, beatView, presentationAction, type DemoBeat } from '@/lib/simulation/presentation';
import { FleetView } from './fleet-view';
import { ComparisonView } from './comparison-view';
import { DecisionView } from './decision-view';

export type DemoView = 'overview' | 'decision' | 'agents' | 'compare';
const labels: Record<DemoView,string> = {overview:'Live simulation',decision:'Decision Center',agents:'AI coordination workflow',compare:'Compare controllers'};
const routes: Record<DemoView,string> = {overview:'/overview',decision:'/decisions',agents:'/agents',compare:'/what-if'};

export function DemoWorkspace({view='overview',initialId}: {view?:DemoView;initialId?:string}) {
  const [session,setSession]=useState<Simulation>(); const current=useRef<Simulation | undefined>(undefined);
  const [busy,setBusy]=useState(false); const locked=useRef(false); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const [running,setRunning]=useState(false); const [automatic,setAutomatic]=useState(view === 'compare'); const [speed,setSpeed]=useState(700);
  const mainRef=useRef<HTMLElement | null>(null);
  const [startingAuto,setStartingAuto]=useState(false);
  const [presentation,setPresentationState]=useState<'off'|'playing'|'paused'>('off');
  const presentationRef=useRef<'off'|'playing'|'paused'>('off');
  const setPresentation=useCallback((value:'off'|'playing'|'paused')=>{presentationRef.current=value;setPresentationState(value);},[]);
  // Read again after awaits: Pause/Manual control can change the ref mid-request.
  const presentationIsActive=()=>presentationRef.current!=='off';
  const [beat,setBeat]=useState<DemoBeat>('factory');
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const activeView=presentation==='off'?view:beatView[beat];
  const [scenario,setScenario]=useState('base'); const [mode,setMode]=useState<'incident'|'policy'>(view === 'compare' ? 'policy' : 'incident'); const [seed,setSeed]=useState('990000001');
  const [setup,setSetup]=useState(false); const [capabilityError,setCapabilityError]=useState('');
  const [available,setAvailable]=useState<boolean>();
  const createIdentity=useRef<{input:string;key:string} | undefined>(undefined);
  const commandIdentity=useRef<{input:string;key:string} | undefined>(undefined);
  const accept = useCallback((data:Simulation)=>{
    current.current=data;setSession(data);setError('');
    try{sessionStorage.setItem('mcc-demo-session',data.id);}catch{}
    const url=new URL(window.location.href);url.searchParams.set('session',data.id);window.history.replaceState(null,'',url);
  },[]);
  useEffect(()=>{
    const abort=new AbortController();
    let stored: string | null=null;try{stored=sessionStorage.getItem('mcc-demo-session');}catch{}
    const addressId=new URLSearchParams(window.location.search).get('session');
    const id=addressId || initialId || stored;
    setLoading(true);
    if(id)researchRequest<Simulation>(`/demo/sessions/${encodeURIComponent(id)}`,{signal:abort.signal}).then(data=>{if(!abort.signal.aborted)accept(data);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    else setLoading(false);
    return()=>abort.abort();
  },[initialId,accept]);
  useEffect(()=>{
    const abort=new AbortController();
    setAvailable(undefined);
    researchRequest<{learned_releases:{arm:string;case_id:string;available:boolean}[]}>('/capabilities',{signal:abort.signal}).then(c=>{if(!abort.signal.aborted)setAvailable(['S','F'].every(arm=>c.learned_releases.some(r=>r.arm===arm&&r.case_id===scenario&&r.available)));}).catch(e=>{if(!abort.signal.aborted){setAvailable(false);setCapabilityError(e.message);}});
    return()=>abort.abort();
  },[scenario]);
  async function create(guided=false) {
    if(locked.current)return;locked.current=true;setBusy(true);setRunning(false);setPresentation('off');setStartingAuto(guided);setError('');
    const body={case:scenario,seed,mode:guided?'incident':mode,primary:'S',baseline:'F'};const input=JSON.stringify(body);
    if(createIdentity.current?.input!==input)createIdentity.current={input,key:crypto.randomUUID()};
    try{const data=await researchRequest<Simulation>('/demo/sessions',{body,key:createIdentity.current.key});if(!mounted.current)return;accept(data);createIdentity.current=undefined;setSetup(false);if(guided){setAutomatic(true);setBeat('factory');setPresentation('playing');}}
    catch(e){setError((e as Error).message);}finally{locked.current=false;setBusy(false);setStartingAuto(false);}
  }
  async function command(body:Record<string,unknown>) {
    const before=current.current;if(!before||locked.current)return;
    locked.current=true;setBusy(true);setError('');
    const inputBody={revision:before.revision,...body};const input=JSON.stringify(inputBody);
    if(commandIdentity.current?.input!==input)commandIdentity.current={input,key:crypto.randomUUID()};
    try{
      const next=await researchRequest<Simulation>(`/demo/sessions/${before.id}/commands`,{body:inputBody,key:commandIdentity.current.key});if(!mounted.current)return;accept(next);commandIdentity.current=undefined;
      if(next.status==='REVIEW'||next.status==='COMPLETE')setRunning(false);
      return next;
    }catch(e){setRunning(false);if(presentationRef.current!=='off')setPresentation('paused');setError((e as Error).message);}finally{locked.current=false;setBusy(false);}
  }
  const decide=async(action:Matching|null,reason:string)=>{await command(action===null ? {command:'approve',reason} : {command:'override',action,reason});};
  useEffect(()=>{
    if(!running||busy||!session||session.status!=='RUNNING')return;
    const timer=setTimeout(()=>void command({command:'advance',autoApprove:automatic}),speed);
    return()=>clearTimeout(timer);
    // A single command at a time, scheduled only after the previous response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[running,busy,session?.revision,automatic,speed]);
  useEffect(()=>{
    if(presentation!=='playing'||busy||!session||beat==='done')return;
    const action=presentationAction(beat);
    const timer=setTimeout(async()=>{
      if(presentationRef.current!=='playing'||!mounted.current)return;
      if(action.next){setBeat(action.next);return;}
      if(action.stopAt){
        const next=await command({command:'autoplay',stopAt:action.stopAt,maxTicks:8});
        if(next&&mounted.current&&presentationIsActive())setBeat(afterBatch(beat,next));
      }
    },action.delay);
    return()=>clearTimeout(timer);
    // Presentation schedules one bounded server command after each response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[presentation,beat,busy,session?.revision]);
  useEffect(()=>{
    if(presentation!=='playing')return;
    const target=beat==='workflow'?'.sim-agent-workflow':beat==='decision'?'.sim-decision':beat==='comparison'||beat==='done'?'.sim-comparison':'.sim-factory-panel';
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    mainRef.current?.querySelector<HTMLElement>(target)?.scrollIntoView?.({block:'start',behavior:reduced?'instant':'smooth'});
  },[beat,presentation,session?.id]);
  const tick=session?.primary.state.tick ?? 0;
  const latest=session?.primary.records.at(-1);
  const suffix=session ? `?session=${session.id}` : '';
  return <AppShell title={presentation==='off'?labels[activeView]:'Auto demo'} simulationId={session?.id}><main ref={mainRef} className="simulation-workspace">
    <header className="sim-page-heading"><div><p className="research-eyebrow"><Activity size={14} aria-hidden="true" /> JCST/1.1 · Engineering simulation</p><h1>{labels[activeView]}</h1><p>Observe a failure, inspect the policy matching and dispatch technicians in the real simulator.</p></div><div className="sim-header-actions"><button className="research-primary" disabled={busy||available!==true||!/^99\d{7}$/.test(seed)} onClick={()=>void create(true)} title="Start a new incident session with automatic policy confirmation"><Play size={14} aria-hidden="true" />{startingAuto?'Starting auto demo…':presentation!=='off'&&beat==='done'?'Replay auto demo':'Auto demo'}</button><button className="sim-button" onClick={()=>{setRunning(false);setPresentation('off');setSetup(v=>!v);}}><RotateCcw size={14} aria-hidden="true" />New session</button></div></header>
    {error && <div role="alert" className="sim-error">{error}<button onClick={()=>{if(current.current){setLoading(true);researchRequest<Simulation>(`/demo/sessions/${current.current.id}`).then(accept).catch(e=>setError(e.message)).finally(()=>setLoading(false));}}}>Reload session</button></div>}
    {(setup||!session&&!loading)&&<section className="sim-panel sim-setup"><div className="sim-panel-heading"><div><h2>Start a simulator session</h2><p>Registered S vs F checkpoints · same root 0 / 96k budget · persisted at each boundary.</p></div></div><div className="sim-setup-fields"><label className="sim-field">Scenario<select value={scenario} onChange={e=>setScenario(e.target.value)}><option value="base">Base · two specialist technicians</option><option value="generalist">Generalist · three technicians</option></select></label><label className="sim-field">Control starts<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="incident">After first failure · shared WAIT prelude</option><option value="policy">At tick 0 · automatic policy from start</option></select></label><label className="sim-field">Engineering seed<input value={seed} onChange={e=>setSeed(e.target.value)} pattern="99[0-9]{7}" /></label></div>
      <p className="sim-footnote">Incident mode makes the trigger visible. Both lanes wait until the same first failure; subsequent transitions use their respective policies. Simulation ticks are abstract time units.</p>
      {available===false&&<p role="status" className="sim-error">Learned runtime is unavailable: {capabilityError || 'Compatible S/F checkpoints are not registered.'}</p>}
      <button className="research-primary" disabled={busy||available!==true||!/^99\d{7}$/.test(seed)} onClick={()=>void create()}>{busy?'Loading verified checkpoints…':'Create simulation'}</button></section>}
    {loading && <p role="status">Loading simulator session…</p>}
    {presentation!=='off'&&session&&<section className="sim-guided-banner" aria-label="Auto demo progress"><div className="sim-guided-copy" role="status" aria-live="polite"><span>Guided auto demo · {presentation==='paused'?'Paused':beat==='done'?'Complete':'Playing'} · Tick {tick} / 64</span><h2>{beatCopy[beat].title}</h2><p>{beatCopy[beat].description}</p><small>Policy confirmation is automatic in this simulation demo.</small></div><div className="sim-guided-actions">{beat==='done'&&<button className="research-primary" disabled={busy||available!==true} onClick={()=>void create(true)}><Play size={14} aria-hidden="true" />Replay auto demo</button>}<button className="sim-button" disabled={beat==='done'} onClick={()=>setPresentation(presentation==='playing'?'paused':'playing')}>{presentation==='playing'?<Pause size={14} aria-hidden="true" />:<Play size={14} aria-hidden="true" />}{presentation==='playing'?'Pause auto demo':'Resume auto demo'}</button><button className="sim-button" onClick={()=>{setPresentation('off');setRunning(false);setAutomatic(false);}}>Manual control</button></div></section>}
    {session && <>
      {presentation==='off'&&<section className="sim-control-bar" aria-label="Simulation controls"><div className="sim-clock"><span className={`sim-live-dot ${session.status==='REVIEW'?'needs-review':''}`} /><strong>Tick {tick}<span> / 64</span></strong><span>{session.status==='REVIEW'?'Awaiting decision':session.status==='COMPLETE'?'Episode complete':tick>=48?'Fixed-risk tail':session.activated?'Policy coordination':'Waiting for first incident'}</span></div><div className="sim-control-actions"><label className="sim-auto"><input type="checkbox" checked={automatic} disabled={running||busy||presentation!=='off'} onChange={e=>setAutomatic(e.target.checked)} />Auto-approve policy</label><select aria-label="Simulation speed" disabled={presentation!=='off'} value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={1400}>Slow</option><option value={700}>Normal</option><option value={50}>Fast</option></select><button className="sim-button" disabled={session.status!=='RUNNING'||busy||presentation!=='off'} onClick={()=>{setRunning(false);void command({command:'advance',autoApprove:automatic});}}><SkipForward size={14} aria-hidden="true" />Step</button><button className="research-primary" disabled={session.status!=='RUNNING'||presentation!=='off'} onClick={()=>setRunning(v=>!v)}>{running?<Pause size={14} aria-hidden="true" />:<Play size={14} aria-hidden="true" />}{running?'Pause':'Run simulator'}</button></div></section>}
      <nav className="sim-view-tabs" aria-label="Simulation views">{(Object.keys(routes) as DemoView[]).map(v=><Link aria-current={activeView===v?'page':undefined} key={v} onClick={()=>{setPresentation('off');setRunning(false);}} href={routes[v]+suffix}>{v==='overview'?'Factory':v==='decision'?'Decision Center':v==='agents'?'AI workflow':`${session.primary.controller} vs ${session.baseline.controller} comparison`}{v==='decision'&&session.status==='REVIEW'&&<span className="sim-tab-dot" />}</Link>)}</nav>
      <div className="sim-context"><span>{session.case_id} · seed {session.physical_seed} · {session.mode==='incident'?'common WAIT prelude':'policy from tick 0'}</span><span>{session.primary.controller} / {session.baseline.controller} · root 0 · 96k checkpoint · revision {session.revision}</span></div>
      {presentation==='off'&&session.status==='REVIEW'&&activeView!=='decision'&&<div className="sim-alert"><AlertTriangle size={18} aria-hidden="true" /><div><strong>Policy matching ready for review at tick {tick}</strong><p>Simulator paused. Inspect the proposal before dispatching technicians.</p></div><Link className="research-primary" href={'/decisions'+suffix}>Review & dispatch<ArrowRight size={14} aria-hidden="true" /></Link></div>}
      {activeView==='compare'?<ComparisonView session={session}/>:activeView==='agents'?<Workflow session={session}/>:<>
        <div className="sim-summary"><div><span>Simulation cost</span><strong>{session.primary.total_cost}</strong></div><div><span>Failed components now</span><strong>{session.primary.state.components.flat().filter(c=>c.failed).length}</strong></div><div><span>Technicians busy</span><strong>{session.primary.state.jobs.filter(Boolean).length}<small> / {session.primary.state.jobs.length}</small></strong></div><div><span>Service completions</span><strong>{session.primary.records.flatMap(r=>r.events).filter(e=>e.type==='completion').length}</strong></div></div>
        {activeView==='decision'&&<DecisionView session={session} automatic={presentation!=='off'} busy={busy||presentation!=='off'} onDecide={decide}/>}
        <section className="sim-panel sim-factory-panel"><div className="sim-panel-heading"><div><h2>Factory state · {session.primary.controller}{session.primary.overrides?' + human override':''}</h2><p>Component condition, active commitments and proposed dispatch destinations.</p></div><span className="evidence-badge">{busy?'Computing…':`Boundary ${tick}`}</span></div><FleetView lane={session.primary} config={session.config} proposal={session.pending?.action}/></section>
        <div className="sim-bottom-grid"><section className="sim-panel"><div className="sim-panel-heading"><h2>Physical events</h2><span className="text-xs text-ash-gray">Latest interval</span></div>{latest?.events.filter(e=>e.type!=='occupancy').length?<ul className="sim-event-list">{latest.events.filter(e=>e.type!=='occupancy').map((e,i)=><li key={i}><span className={`sim-event-type event-${e.type}`}>{e.type}</span><span>t{e.tick} · M{e.machine+1}/C{e.component+1}{e.technician==null?'':` · T${e.technician+1}`}{e.kind?` · ${e.kind}`:''}</span></li>)}</ul>:<p className="sim-footnote">{tick?'No start, failure or completion event in the latest interval.':'Start the simulator to generate physical events.'}</p>}</section><section className="sim-panel"><div className="sim-panel-heading"><h2>Coordination workflow</h2><Link href={'/agents'+suffix}>Inspect →</Link></div>{session.workflow.length?<ol className="sim-mini-workflow">{session.workflow.slice(-4).map((e,i)=><li key={i}><CheckCircle2 size={13} aria-hidden="true"/><span>t{e.tick} · {e.stage.replaceAll('_',' ')}</span></li>)}</ol>:<p className="sim-footnote">Component monitoring is active. Policy workflow starts {session.mode==='incident'?'after the first simulator failure.':'at the first decision boundary.'}</p>}</section></div>
      </>}
      <section className="sim-provenance"><GitCompareArrows size={16} aria-hidden="true" /><p>Engineering demonstration using pinned JCST <code>{session.source_commit.slice(0,8)}</code>. No training or scientific test set is opened. <Link href="/research">View research evidence →</Link></p><details><summary>Checkpoint provenance</summary>{Object.entries(session.releases).map(([arm,r])=><p key={arm}>{arm} · {r.release_id}<br/><code>{r.sha256}</code></p>)}</details></section>
    </>}
    <footer className="sim-footer">Simulation decisions affect this session only. <Link href="/legacy/overview">Open legacy sample workspace</Link></footer>
  </main></AppShell>;
}
function Workflow({session}:{session:Simulation}) {
  return <section className="sim-panel sim-agent-workflow"><div className="sim-panel-heading"><div><h2>AI coordination workflow</h2><p>Actual simulator observations, policy calls, validation and confirmations. One centralized S policy; no independent RL agents.</p></div><span className="evidence-badge">{session.status}</span></div>{!session.workflow.length?<p className="sim-footnote">Run the simulator to create workflow events.</p>:<ol className="sim-workflow">{session.workflow.slice().reverse().map((e,i)=><li key={i}><span className="sim-workflow-tick">t{e.tick}</span><div><strong>{e.stage.replaceAll('_',' ')}</strong><p>{e.message}</p></div><CheckCircle2 size={16} aria-hidden="true"/></li>)}</ol>}</section>;
}
