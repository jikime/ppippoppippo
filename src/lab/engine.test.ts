import { describe, expect, test } from 'vitest';
import { conditionsFor, positionAt, replayWorld, runPair, simulate } from './engine';
import { BASELINE, IMPROVED, rankFindings, validConfig } from './model';
import type { RunConfig } from './model';
import { TABLES } from '../simulation/layout';
import { persona } from '../simulation/profiles';
import { report } from './report';

const config:RunConfig={seed:20261009,count:100,hazard:'mixed',horizon:180,baseline:{...BASELINE},candidate:{...IMPROVED}};
describe('reproducible paired world experiments',()=>{
  test('seed controls the environment and all person traits independently of manual branches',()=>{
    const first=runPair(config,4);expect(runPair(config,4)).toEqual(first);expect(runPair({...config,seed:8},4)).not.toEqual(first);
    const b=replayWorld(config,first,'before'),a=replayWorld(config,first,'after');
    expect(a.agents.map(p=>p.persona)).toEqual(b.agents.map(p=>p.persona));
    expect(new Set(Array.from({length:10000},(_,i)=>conditionsFor(config,i).seed)).size).toBe(10000);
  });
  test('identical manuals give identical metrics, including adverse worlds',()=>{
    for(let i=0;i<30;i++){const r=runPair({...config,candidate:{...BASELINE}},i);expect(r.after).toEqual(r.before);}
  });
  test('changed notice channels change actual agent departure times',()=>{
    const c=conditionsFor({...config,hazard:'blackout'},0);
    const b=simulate(c,BASELINE,180,true),a=simulate(c,{...BASELINE,multimodalAlert:true},180,true);
    for(const agent of b.agents){const improved=a.agents.find(p=>p.persona.id===agent.persona.id)!;expect(agent.depart-improved.depart).toBe(agent.persona.visualNotice?65:0);}
  });
  test('hazard exclusion never assigns a route crossing the hazard; unresolved holds are counted',()=>{
    for(let i=0;i<25;i++){
      const r=runPair({...config,hazard:'fire'},i);expect(r.after.riskyRoutes).toBe(0);
      const replay=replayWorld({...config,hazard:'fire'},r,'after');
      expect(r.after.unresolved).toBe(replay.agents.filter(a=>a.finish>180||a.allergyMismatch).length);
    }
  });
  test('closed portals have no assigned traffic and all movement segments avoid table interiors',()=>{
    const c=conditionsFor({...config,hazard:'blackout'},0);c.closedExit=1;
    const {agents,metrics}=simulate(c,IMPROVED,180,true);expect(metrics.exitLoads[1]).toBe(0);
    expect(metrics.exitLoads.reduce((s,n)=>s+n,0)).toBe(120);
    for(const a of agents)for(let t=a.depart;t<a.arrive;t+=.25){const pos=positionAt(a,t);for(const table of TABLES)expect(Math.abs(pos.x-table.x)<1.35&&Math.abs(pos.z-table.z)<.5,`${a.persona.id} ${JSON.stringify(pos)}`).toBe(false);}
  });
  test('queue service respects arrival order and finite capacity',()=>{
    const c=conditionsFor({...config,hazard:'blackout'},2),{agents}=simulate(c,BASELINE,300,true);
    for(let i=0;i<3;i++){
      const queue=agents.filter(a=>a.exit===i).sort((a,b)=>a.arrive-b.arrive||a.persona.ordinal-b.persona.ordinal);
      for(let j=0;j<queue.length;j++){expect(queue[j].finish).toBeGreaterThan(queue[j].arrive);if(j)expect(queue[j].finish).toBeGreaterThan(queue[j-1].finish);}
    }
  });
  test('security confirmation is not generic fire evacuation or a claim that danger is resolved',()=>{
    const r=runPair({...config,hazard:'security'},0);expect(r.before.missingProtocol).toBe(1);expect(r.before.unresolved).toBe(120);expect(r.after.missingProtocol).toBe(0);
    const trace=replayWorld(config,r,'after');expect(trace.agents.every(a=>a.exit===null&&a.outcome==='acknowledged')).toBe(true);expect(r.after.exitLoads).toEqual([0,0,0]);
  });
  test('checking allergens removes incompatible service and counts unavailable alternatives as holds',()=>{
    const c=conditionsFor({...config,hazard:'allergy'},3);c.alternativeMeal=false;
    const b=simulate(c,BASELINE,180,true),a=simulate(c,IMPROVED,180,true);
    expect(b.metrics.allergyExposures).toBeGreaterThan(0);expect(a.metrics.allergyExposures).toBe(0);
    expect(a.agents.filter(p=>p.outcome==='held').length).toBe(b.metrics.allergyExposures);
    expect(a.metrics.unresolved).toBeGreaterThanOrEqual(a.agents.filter(p=>p.outcome==='held').length);
  });
  test('replay regeneration exactly matches recorded results and scrubs without randomness',()=>{
    const r=runPair(config,9),replay=replayWorld(config,r,'before');
    expect(simulate(r.conditions,config.baseline,180).metrics).toEqual(r.before);
    for(const a of replay.agents){expect(positionAt(a,0)).toEqual(a.path[0]);expect(positionAt(a,a.arrive)).toEqual(a.path.at(-1));expect(positionAt(a,45)).toEqual(positionAt(a,45));}
  });
  test('ranked evidence preserves regressions, exports completed counts and model assumptions',()=>{
    const worse={...config,baseline:{...IMPROVED},candidate:{...BASELINE}};
    const results=Array.from({length:40},(_,i)=>runPair(worse,i)),findings=rankFindings(results);
    expect(findings.some(f=>f.afterTotal>f.total)).toBe(true);expect(findings.every(f=>f.score>=0&&f.score<=100)).toBe(true);
    const exported=report(worse,results,'cancelled',null);expect(exported.completedWorlds).toBe(40);expect(exported.completedSimulations).toBe(80);expect(exported.requestedWorlds).toBe(100);
    expect(JSON.parse(JSON.stringify(exported)).worlds).toEqual(results);
  });
  test('configuration bounds prevent accidental unbounded experiments',()=>{
    expect(validConfig(config)).toBe(true);for(const count of [0,-1,10001,1.5,NaN])expect(validConfig({...config,count})).toBe(false);
    expect(validConfig({...config,seed:-1})).toBe(false);expect(validConfig({...config,horizon:0})).toBe(false);
  });
});
test('synthetic identities and seating teams stay stable; changed worlds change assumptions',()=>{
  const profiles=Array.from({length:120},(_,i)=>persona(i));
  expect(new Set(profiles.map(p=>p.name)).size).toBe(120);expect(profiles[0].name).toBe('이현서');
  const teams=new Map<string,number>();profiles.filter(p=>p.role==='participant').forEach(p=>teams.set(p.team,(teams.get(p.team)??0)+1));
  expect(teams.size).toBe(18);expect([...teams.values()].every(n=>n===6)).toBe(true);
  expect(persona(0)).toEqual(persona(0));expect(persona(0,5)).not.toEqual(persona(0,7));
});
