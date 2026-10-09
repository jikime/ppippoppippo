import { EXITS, SEATS } from '../simulation/layout';
import { persona, randomSource } from '../simulation/profiles';
import { HAZARDS, FINDINGS, findingValue, hazardNames } from './model';
import type { Conditions, FindingKey, Manual, Metrics, PairResult, Point, Replay, RunConfig, TraceAgent } from './model';

const distance = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.z-b.z);
export const pathLength = (path:Point[]) => path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
export function conditionsFor(config:RunConfig,index:number):Conditions {
  const seed=(config.seed+Math.imul(index+1,0x9e3779b9))>>>0,r=randomSource(seed);
  const hazard=config.hazard==='mixed'?HAZARDS[Math.floor(r()*4)]:config.hazard;
  return {seed,hazard,hazardPoint:{x:[-8,0,8][Math.floor(r()*3)],z:2+r()*3},radius:1.4+r()*1.1,
    closedExit:r()<.65?Math.floor(r()*3):-1,announcementDelay:8+Math.floor(r()*33),capacityScale:.55+r()*.6,
    alternativeMeal:r()>.25,minute:hazard==='allergy'?720:hazard==='security'?1030:780};
}
function startAt(i:number):Point {
  if(i<108){const s=SEATS[(i*37)%108];return{x:s.x,z:s.z};}
  return{x:-12+(i-108)%7*4,z:-5.5};
}
// A fixed aisle graph derived from the table rows. It is an event/queue model,
// not the Recast crowd solver or a smoke, injury, structural or clinical model.
function approach(start:Point,laneOverride?:number):Point[] {
  const lane=laneOverride??Math.max(-12,Math.min(12,Math.round(start.x/4)*4));
  const row=SEATS.find(s=>Math.abs(s.z-start.z)<.01);
  const z=row ? start.z+Math.sign(start.z-Math.round(start.z/3.5)*3.5)*.65 : start.z;
  return [start,{x:start.x,z},{x:lane,z},{x:lane,z:5.6}];
}
function route(start:Point,exit:number,lane?:number):Point[] {
  const p=approach(start,lane),e=EXITS[exit];
  return [...p,{x:e.x,z:5.6},{x:e.x,z:6.55}];
}
export function intersects(path:Point[],center:Point,radius:number):boolean {
  return path.slice(1).some((b,i)=>{
    const a=path[i],dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
    const t=l?Math.max(0,Math.min(1,((center.x-a.x)*dx+(center.z-a.z)*dz)/l)):0;
    return Math.hypot(a.x+t*dx-center.x,a.z+t*dz-center.z)<=radius;
  });
}
export function simulate(conditions:Conditions,manual:Manual,horizon:number,trace=false):{metrics:Metrics;agents:TraceAgent[]} {
  const c=conditions,loads:[number,number,number]=[0,0,0],staff=Array<number>(5).fill(0);
  const agents:TraceAgent[]=[];
  const metrics:Metrics={unresolved:0,riskyRoutes:0,unassisted:0,allergyExposures:0,lateResponse:0,missingProtocol:c.hazard==='security'&&!manual.securityProtocol?1:0,maxQueue:0,completionSeconds:0,exitLoads:loads};
  const people=Array.from({length:120},(_,i)=>{
    const p=persona(i,c.seed);
    const response=c.announcementDelay+p.reactionSeconds+(p.visualNotice&&!manual.multimodalAlert?65:0)+(p.companion?10:0);
    return {p,response,start:startAt(i)};
  }).sort((a,b)=>a.response-b.response||a.p.ordinal-b.p.ordinal);
  for(const {p,response,start} of people){
    const r=randomSource((c.seed^Math.imul(p.ordinal+7,2246822519))>>>0);
    let depart=response,path=[start],finish=Infinity,exit:number|null=null,outcome:TraceAgent['outcome']='held';
    let assisted=false,allergyMismatch=false,speed=p.walkSpeed;
    if(c.hazard==='fire'||c.hazard==='blackout'){
      if(p.needsAssistance){
        if(manual.assistedEvacuation){const k=staff.indexOf(Math.min(...staff));depart=Math.max(depart,staff[k])+8;staff[k]=depart+22;assisted=true;speed*=1.15;}
        else{metrics.unassisted++;depart+=40;}
      }
      if(c.hazard==='blackout')speed*=.72;
      const options=EXITS.flatMap((e,k)=>{
        if(k===c.closedExit)return[];
        const candidates=c.hazard==='fire'&&manual.avoidHazard?[-12,-8,-4,0,4,8,12].map(lane=>route(start,k,lane)).filter(path=>!intersects(path,c.hazardPoint,c.radius)):[route(start,k)];
        if(!candidates.length)return[];
        const path=candidates.sort((a,b)=>pathLength(a)-pathLength(b))[0];
        const cost=pathLength(path)/speed+(manual.balancedExits?loads[k]/(e.capacity*c.capacityScale):(!p.familiarity||p.familiarity<.65)&&k!==1?65:0);
        return [{k,path,cost}];
      }).sort((a,b)=>a.cost-b.cost||a.k-b.k);
      if(options.length){exit=options[0].k;path=options[0].path;loads[exit]++;outcome='evacuated';}
    }else if(c.hazard==='security'){
      if(manual.securityProtocol){finish=depart+8+p.ordinal%5*2;outcome='acknowledged';}
      else{
        // Explicit baseline assumption: the only available plan is generic exit guidance.
        depart+=25;const k=c.closedExit===1?0:1;path=route(start,k);exit=k;loads[k]++;outcome='unverified-exit';
      }
    }else{
      const x=r()<.5?-13.3:13.3;
      path=[...approach(start),{x,z:5.6},{x,z:2.2}];
      const ingredient=r()<.5?'nuts':'milk';
      const incompatible=p.allergy===ingredient;
      const mealWait=Math.floor(p.ordinal/6)*1.2;
      if(incompatible&&manual.allergyCheck&&!c.alternativeMeal)outcome='held';
      else{outcome='meal';finish=depart+pathLength(path)/speed+mealWait+8+(incompatible&&manual.allergyCheck?12:0);}
      allergyMismatch=incompatible&&!manual.allergyCheck;
      if(allergyMismatch)metrics.allergyExposures++;
    }
    const length=pathLength(path),arrive=depart+length/speed;
    const risky=(c.hazard==='fire'||c.hazard==='security')&&intersects(path,c.hazardPoint,c.radius);
    if(risky)metrics.riskyRoutes++;
    if(depart>60)metrics.lateResponse++;
    agents.push({persona:p,path,length,depart,arrive,finish,exit,outcome,risky,allergyMismatch,assisted});
  }
  for(let e=0;e<3;e++){
    const queue=agents.filter(a=>a.exit===e).sort((a,b)=>a.arrive-b.arrive||a.persona.ordinal-b.persona.ordinal);
    let available=0,head=0;const releases:number[]=[];
    for(const a of queue){
      while(head<releases.length&&releases[head]<=a.arrive)head++;
      if(a.arrive<=horizon)metrics.maxQueue=Math.max(metrics.maxQueue,releases.length-head+1);
      if(trace)a.queueAhead=releases.slice();
      available=Math.max(available,a.arrive)+1/(EXITS[e].capacity*c.capacityScale);
      a.release=available;
      releases.push(available);
      if(a.outcome==='evacuated')a.finish=available;
    }
  }
  for(const a of agents){
    if(a.finish>horizon||a.allergyMismatch)metrics.unresolved++;
    if(Number.isFinite(a.finish))metrics.completionSeconds=Math.max(metrics.completionSeconds,Math.min(horizon,a.finish));
  }
  if(metrics.unresolved)metrics.completionSeconds=horizon;
  metrics.completionSeconds=Math.round(metrics.completionSeconds*10)/10;
  return {metrics,agents:trace?agents.sort((a,b)=>a.persona.ordinal-b.persona.ordinal):[]};
}
export function runPair(config:RunConfig,index:number):PairResult {
  const conditions=conditionsFor(config,index);
  const before=simulate(conditions,config.baseline,config.horizon).metrics;
  const after=simulate(conditions,config.candidate,config.horizon).metrics;
  const score=(Object.keys(FINDINGS) as FindingKey[]).reduce((sum,k)=>sum+findingValue(before,k)*FINDINGS[k].weight,0);
  return {index,conditions,before,after,score};
}
export function replayWorld(config:RunConfig,result:PairResult,variant:'before'|'after'):Replay {
  const {agents}=simulate(result.conditions,variant==='before'?config.baseline:config.candidate,config.horizon,true);
  const m=result[variant];
  return {world:result,variant,agents,horizon:config.horizon,events:[
    {time:0,title:hazardNames[result.conditions.hazard],detail:`세계 ${result.index+1} · seed ${result.conditions.seed} · 합성 인물 120명`},
    {time:result.conditions.announcementDelay,title:'첫 안내 전달',detail:`지연 가정 ${result.conditions.announcementDelay}초 · ${variant==='before'?'현행':'개선'} 매뉴얼 적용`},
    {time:Math.min(...agents.map(a=>a.depart)),title:'첫 인물 대응 시작',detail:'개인별 반응 시간·동반자·안내 채널을 반영했습니다.'},
    {time:Math.min(config.horizon,Math.max(...agents.map(a=>a.arrive))),title:'배정 경로 이동 관측',detail:`위험 구역 통과 ${m.riskyRoutes}명 · 최대 출구 대기 ${m.maxQueue}명`},
    {time:config.horizon,title:'관찰 종료',detail:`미완료 ${m.unresolved}명 · 부적합 배식 ${m.allergyExposures}명 · 지원 미배정 ${m.unassisted}명`},
  ].sort((a,b)=>a.time-b.time)};
}
export function positionAt(a:TraceAgent,time:number):Point {
  if(time<=a.depart||!a.length)return a.path[0];
  if(time>=a.arrive)return a.path[a.path.length-1];
  let traveled=Math.min(1,(time-a.depart)/Math.max(.001,a.arrive-a.depart))*a.length;
  for(let i=1;i<a.path.length;i++){
    const d=distance(a.path[i-1],a.path[i]);
    if(traveled<=d){const t=d?traveled/d:0;return{x:a.path[i-1].x+(a.path[i].x-a.path[i-1].x)*t,z:a.path[i-1].z+(a.path[i].z-a.path[i-1].z)*t};}
    traveled-=d;
  }
  return a.path[a.path.length-1];
}

// Spread a logical portal queue back along its recorded aisle for 3D inspection.
// Queue coordinates are a display projection, not collision simulation evidence.
export function replayPositionAt(a:TraceAgent,time:number):Point {
  if(a.exit===null||!a.queueAhead||time<=a.depart)return positionAt(a,time);
  const ahead=a.queueAhead.filter(release=>release>time).length;
  const cappedProgress=Math.max(0,1-ahead*.5/Math.max(.01,a.length));
  const projectedTime=Math.min(time,a.depart+(a.arrive-a.depart)*cappedProgress);
  const pos=positionAt(a,projectedTime);
  if(a.release!==undefined&&time>=a.release){return{x:pos.x,z:8.25};}
  return pos;
}
