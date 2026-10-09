import { createActor, createMachine } from 'xstate';
import { Crowd } from 'recast-navigation';
import type { CrowdAgent } from 'recast-navigation';
import { Navigation } from './navigation';
import { EXITS, PATROL, SEATS, TABLES, distance, vector } from './layout';
import type { ExitId, Vec } from './layout';

export type Role='participant'|'operator'|'judge'|'host';
export type State='working'|'walking'|'waiting'|'guiding'|'visiting'|'outside'|'presenting'|'idle'|'blocked';
export type Scenario='normal'|'break'|'incident';
const behavior=createMachine({
  id:'person',initial:'idle',
  on:{WORK:'.working',WALK:'.walking',WAIT:'.waiting',GUIDE:'.guiding',VISIT:'.visiting',EXIT:'.outside',PRESENT:'.presenting',IDLE:'.idle',BLOCK:'.blocked'},
  states:{working:{},walking:{},waiting:{},guiding:{},visiting:{},outside:{},presenting:{},idle:{},blocked:{}},
});
const events:Record<State,string>={working:'WORK',walking:'WALK',waiting:'WAIT',guiding:'GUIDE',visiting:'VISIT',outside:'EXIT',presenting:'PRESENT',idle:'IDLE',blocked:'BLOCK'};
export interface Person {
  id:string; role:Role; variant:string; position:Vec; previous:Vec; heading:number;
  state:State; actor:ReturnType<typeof createActor<typeof behavior>>;
  speed:number; agent?:CrowdAgent; goal?:Vec; goalName:string;
  seat?:typeof SEATS[number]; exit?:ExitId; nextAction:number; ordinal:number;
  stage:'roam'|'seat'|'exit'|'release'|'guide'|'visit'; path:Vec[]; stepDistance:number;
}
export interface Log {id:number;time:number;title:string;detail:string;level:'info'|'success'|'warning'}
export interface ExitState {id:ExitId;open:boolean;queue:string[];departed:number;nextRelease:number}
export interface Snapshot {
  ready:boolean; error:string|null;time:number;running:boolean;speed:number;scenario:Scenario;guidance:boolean;guides:number;story:boolean;storyStep:number;
  total:number;inside:number;working:number;moving:number;waiting:number;outside:number;blocked:number;occupancy:number;
  exits:{id:ExitId;open:boolean;queue:number;assigned:number;departed:number}[];
  zones:{name:string;count:number;moving:number;pressure:number}[];
  logs:Log[];history:{time:number;inside:number;moving:number;waiting:number}[];revision:number;
}

export class World {
  navigation=new Navigation(); people:Person[]=[];exits:ExitState[]=EXITS.map(e=>({id:e.id,open:true,queue:[],departed:0,nextRelease:0}));
  ready=false;error:string|null=null;time=0;running=true;speed=1;scenario:Scenario='normal';guidance=false;
  story=false;storyStep=0;revision=0;logs:Log[]=[];history:Snapshot['history']=[];
  accumulator=0;alpha=0;private lastPublish=-1;private lastHistory=-1;private lastRouteUpdate=-1;private counter=0;private started?:Promise<void>;
  private listeners=new Set<()=>void>();
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>this.listeners.delete(fn);};
  publish(){this.listeners.forEach(fn=>fn());}
  async initialize(){return this.started??=(async()=>{try{await this.navigation.initialize();this.ready=true;this.reset();}catch(e){this.error=e instanceof Error?e.message:String(e);this.publish();}})();}
  log(title:string,detail:string,level:Log['level']='info'){
    this.logs.unshift({id:++this.counter,time:this.time,title,detail,level});this.logs=this.logs.slice(0,80);
  }
  setState(p:Person,state:State){if(p.state!==state){p.state=state;p.actor.send({type:events[state]});}}
  reset(scenario:Scenario='normal'){
    if(!this.ready)return;
    this.people.forEach(p=>p.actor.stop());this.navigation.crowd.destroy();
    EXITS.forEach(e=>this.navigation.setExit(e.id,true));
    this.navigation.crowd=new Crowd(this.navigation.navMesh,{maxAgents:160,maxAgentRadius:.35});
    this.people=[];this.time=0;this.accumulator=0;this.alpha=0;this.scenario=scenario;this.guidance=false;this.running=true;this.story=false;this.storyStep=0;
    this.exits=EXITS.map(e=>({id:e.id,open:true,queue:[],departed:0,nextRelease:0}));
    this.logs=[];this.history=[];this.lastHistory=-1;this.lastPublish=-1;this.lastRouteUpdate=-1;
    const variants=['participant-teal','participant-navy','participant-cream'];
    // A stable seat permutation preserves unique seat ownership and visible empty seats.
    for(let i=0;i<108;i++){
      const seat=i<96?SEATS[(i*37)%108]:undefined;
      const pos=seat?vector(seat.x,seat.z):{...PATROL[(i-96)%6],x:PATROL[(i-96)%6].x+(i%2?.4:-.4)};
      const p=this.add(`P${String(i+1).padStart(3,'0')}`,'participant',variants[i%3],pos,i);
      p.seat=seat;p.heading=seat?.heading??0;p.nextAction=seat?18+(i%48)*1.7:3+(i%13)*.65;
      this.setState(p,seat?'working':'idle');p.goalName=seat?`${seat.table} · 지정 좌석`:'행사장 둘러보기';
      if(seat)this.ensureAgent(p).maxSpeed=0;
    }
    for(let i=0;i<5;i++){const p=this.add(`OP${i+1}`,'operator','operator',PATROL[i],108+i);p.nextAction=1+i*.8;p.goalName='행사장 순찰';}
    for(let i=0;i<6;i++){const p=this.add(`J${i+1}`,'judge','judge',vector(-10+i*4,-5.5),113+i);p.nextAction=.5+i*.5;p.goalName='팀 방문 준비';}
    const host=this.add('HOST','host','host',vector(-12.7,-5.7),119);host.heading=.35;host.goalName='프로젝트 발표';this.setState(host,'presenting');
    this.revision++;this.log('행사장 관제 시작','120명의 익명 인물 · 18개 팀 테이블 · 3개 출입구','success');
    if(scenario!=='normal'){this.startBreak(false);if(scenario==='incident')this.toggleExit('B',false);}
    this.publish();
  }
  private add(id:string,role:Role,variant:string,position:Vec,ordinal:number){
    const p:Person={id,role,variant,position:{...position},previous:{...position},heading:0,state:'idle',actor:createActor(behavior).start(),speed:0,goalName:'대기',nextAction:0,ordinal,stage:'roam',path:[],stepDistance:0};
    this.people.push(p);return p;
  }
  private ensureAgent(p:Person){
    if(!p.agent){
      const pos=this.navigation.closest(p.position);p.position={...pos};p.previous={...pos};
      p.agent=this.navigation.crowd.addAgent(pos,{radius:.21,height:1.65,maxAcceleration:4,maxSpeed:1.02+(p.ordinal%5)*.065,collisionQueryRange:1.6,pathOptimizationRange:8,separationWeight:1.8,updateFlags:31});
    }
    return p.agent;
  }
  private stop(p:Person,remove=false){
    if(p.agent){p.agent.resetMoveTarget();p.agent.maxSpeed=0;if(remove){this.navigation.crowd.removeAgent(p.agent);p.agent=undefined;}}
    p.speed=0;p.path=[];p.goal=undefined;
  }
  private move(p:Person,goal:Vec,label:string,stage:Person['stage']){
    const target=this.navigation.closest(goal);const agent=this.ensureAgent(p);
    agent.maxSpeed=1.02+(p.ordinal%5)*.065;
    p.path=this.navigation.path(p.position,target);
    const reached=p.path.length>0&&distance(p.path[p.path.length-1],target)<.6;
    if(!reached||!agent.requestMoveTarget(target)){this.stop(p);this.setState(p,'blocked');p.nextAction=this.time+2;return false;}
    p.goal=target;p.goalName=label;p.stage=stage;this.setState(p,'walking');return true;
  }
  private chooseExit(p:Person):ExitId|undefined{
    const available=this.exits.filter(e=>e.open);
    return available.sort((a,b)=>{
      const score=(e:ExitState)=>{
        const def=EXITS.find(x=>x.id===e.id)!;
        const assigned=this.people.filter(x=>x.exit===e.id&&x.state!=='outside').length;
        return distance(p.position,vector(def.x,5.8))+(this.guidance?assigned/def.capacity*.7:0);
      };return score(a)-score(b);
    })[0]?.id;
  }
  private sendToExit(p:Person){
    for(const e of this.exits)e.queue=e.queue.filter(id=>id!==p.id);
    p.exit=undefined;const id=this.chooseExit(p);
    if(!id){this.stop(p);this.setState(p,'blocked');p.goalName='열린 출입구 없음';p.stage='exit';return;}
    p.exit=id;const def=EXITS.find(e=>e.id===id)!;
    const approaching=this.people.filter(x=>x.exit===id&&x.stage==='exit').length;
    this.move(p,vector(def.x+(p.ordinal%2?.25:-.25),Math.max(-4.8,5.8-Math.min(approaching,18)*.13)),`${id} 출입구로 이동`,'exit');
  }
  startBreak(publish=true){
    this.scenario=this.exits.some(e=>!e.open)?'incident':'break';
    for(const p of this.people)if(p.role==='participant'&&p.state!=='outside')p.nextAction=this.time+1+(p.ordinal%24)*.38;
    const host=this.people.find(p=>p.role==='host');if(host){this.setState(host,'idle');host.goalName='다음 발표 대기';}
    this.log('휴식 시간 · 이동 시작','참가자가 좌석에서 일어나 출입구로 이동합니다.');
    if(publish)this.publish();
  }
  toggleExit(id:ExitId,open?:boolean){
    if(!this.ready)return;const e=this.exits.find(x=>x.id===id)!;e.open=open??!e.open;
    this.navigation.setExit(id,e.open);e.queue=[];
    if(this.scenario!=='normal')this.scenario=this.exits.some(x=>!x.open)?'incident':'break';
    for(const p of this.people){
      if(p.role==='participant'&&p.state!=='outside'&&(p.exit===id||p.state==='blocked'))this.sendToExit(p);
      else if(p.state==='walking'&&p.goal)this.move(p,p.goal,p.goalName,p.stage);
    }
    this.log(`${id} 출입구 ${e.open?'개방':'통제'}`,e.open?'통행 경로가 복원되었습니다.':'통행 가능 영역과 참가자 경로를 다시 계산했습니다.',e.open?'success':'warning');
    if(!this.exits.some(x=>x.open))this.log('모든 출입구 통제','참가자는 이동을 멈추고 출입구 개방을 기다립니다.','warning');
    this.publish();
  }
  dispatch(){
    if(!this.ready||this.guidance)return;this.guidance=true;
    const locations=[vector(-13.5,5),vector(1.8,5.3),vector(13.5,5),vector(-6,-5.8),vector(6,-5.8)];
    this.people.filter(p=>p.role==='operator').forEach((p,i)=>{this.move(p,locations[i],'현장 안내 위치','guide');});
    for(const p of this.people)if(p.role==='participant'&&p.state!=='outside'&&p.stage==='exit'&&p.state!=='waiting')this.sendToExit(p);
    this.log('운영요원 5명 현장 배치','출입구별 대기 인원과 처리량을 반영해 동선을 분산합니다.','success');this.publish();
  }
  startStory(){this.reset();this.story=true;this.speed=1;this.log('라이브 시나리오 시작','일상 → 휴식 → 출입구 통제 → 현장 대응');this.publish();}
  setRunning(value:boolean){this.running=value;this.publish();}
  setSpeed(value:number){this.speed=value;this.publish();}
  advance(delta:number){
    if(!this.ready||!this.running)return;
    this.accumulator+=Math.min(delta,.1)*this.speed;
    const dt=.05;
    while(this.accumulator>=dt){this.tick(dt);this.accumulator-=dt;}
    this.alpha=this.accumulator/dt;
    if(this.time-this.lastPublish>=.2){this.lastPublish=this.time;this.publish();}
  }
  tick(dt=.05){
    if(!this.ready)return;this.time+=dt;
    if(this.story){
      if(this.time>=6&&this.storyStep===0){this.storyStep=1;this.startBreak(false);}
      if(this.time>=15&&this.storyStep===1){this.storyStep=2;this.toggleExit('B',false);}
      if(this.time>=24&&this.storyStep===2){this.storyStep=3;this.dispatch();}
      if(this.time>=55&&this.storyStep===3){this.storyStep=4;this.toggleExit('B',true);this.log('출입구 복구 · 대응 지속','현재 대기 인원과 퇴장 기록으로 대응 결과를 확인하세요.','success');}
      if(this.time>=85){this.story=false;this.storyStep=5;this.log('시연 종료','관제는 계속됩니다. 직접 출입구와 배속을 조작할 수 있습니다.');}
    }
    if(this.time-this.lastRouteUpdate>1){
      this.lastRouteUpdate=this.time;
      // The end of a queue moves. Approaching people must not keep aiming at an
      // obsolete tail position after the queue has already advanced.
      for(const p of this.people)if(p.stage==='exit'&&p.state==='walking'&&p.exit){
        const def=EXITS.find(e=>e.id===p.exit)!,exit=this.exits.find(e=>e.id===p.exit)!;
        const target=vector(def.x+(p.ordinal%2?.24:-.24),Math.max(-4.5,5.75-exit.queue.length*.29));
        if(p.goal&&distance(p.goal,target)>.7)this.move(p,target,p.goalName,'exit');
      }
    }
    for(const p of this.people){
      p.previous={...p.position};
      if(p.state==='outside'||p.role==='host')continue;
      if(p.role==='participant'&&this.scenario!=='normal'&&p.stage!=='exit'&&p.stage!=='release'&&this.time>=p.nextAction){this.sendToExit(p);continue;}
      if(p.role==='participant'&&p.seat&&p.state==='working'&&this.scenario==='normal'&&this.time>=p.nextAction){
        if(this.people.filter(other=>other.role==='participant'&&other.seat&&other.state!=='working').length<8){this.move(p,PATROL[(p.ordinal+2)%PATROL.length],'잠시 휴게 공간 방문','roam');}
        else p.nextAction=this.time+3;
      }
      if(p.state==='blocked'&&p.stage!=='exit'&&this.time>=p.nextAction){p.nextAction=this.time+3;this.setState(p,'idle');}
      if(p.role==='judge'&&this.scenario!=='normal'&&p.stage==='visit'){
        const i=p.ordinal-113;this.move(p,vector(i<3?-13.4:13.4,[-3.5,0,3.5][i%3]),'심사 휴식 · 휴게 공간','roam');
      }
      if((p.state==='idle'||p.state==='visiting')&&this.time>=p.nextAction){
        if(p.role==='judge'){
          const occupied=TABLES.filter(t=>this.people.some(other=>other.seat?.table===t.id&&other.state==='working'));
          if(this.scenario==='normal'&&occupied.length){const t=occupied[(p.ordinal+Math.floor(this.time/12))%occupied.length];this.move(p,vector(t.x,t.z-1.43),`${t.id} 팀 심사`,'visit');}
          else {this.stop(p);this.setState(p,'idle');p.nextAction=this.time+5;p.goalName='심사 휴식 · 대기';}
        }else if(p.role==='operator'&&!this.guidance){
          this.move(p,PATROL[(p.ordinal+Math.floor(this.time/9))%PATROL.length],'행사장 순찰','roam');
        }else if(p.role==='participant'&&this.scenario==='normal'){
          if(p.seat)this.move(p,vector(p.seat.x,p.seat.z),`${p.seat.table} · 지정 좌석 복귀`,'seat');
          else this.move(p,PATROL[(p.ordinal+Math.floor(this.time/8))%PATROL.length],'휴게 공간 방문','roam');
        }
      }
    }
    this.navigation.crowd.update(dt);
    for(const p of this.people){
      if(!p.agent||p.state==='outside')continue;
      p.position=p.agent.position();const v=p.agent.velocity();p.speed=Math.hypot(v.x,v.z);p.stepDistance+=p.speed*dt;
      if(p.speed>.08)p.heading=Math.atan2(v.x,v.z);
      const destination=p.exit?EXITS.find(e=>e.id===p.exit):undefined;
      const queue=p.exit?this.exits.find(e=>e.id===p.exit):undefined;
      const joinsQueue=p.stage==='exit'&&destination&&queue&&Math.abs(p.position.x-destination.x)<.85&&p.position.z>=5.7-queue.queue.length*.30-1;
      // Departure is crossing the outside boundary, not competing for a single point.
      const arrived=p.stage==='release'?p.position.z>8.05:!!p.goal&&(distance(p.position,p.goal)<(p.stage==='exit'?.65:.27)||joinsQueue);
      if(p.state==='walking'&&arrived){
        if(p.stage==='release'){
          this.stop(p,true);this.setState(p,'outside');this.exits.find(e=>e.id===p.exit)!.departed++;
        }else if(p.stage==='exit'){
          const e=this.exits.find(e=>e.id===p.exit)!;
          if(!e.open){this.sendToExit(p);continue;}
          if(!e.queue.includes(p.id))e.queue.push(p.id);
          this.stop(p);this.setState(p,'waiting');p.goalName=`${e.id} 출입구 대기`;
        }else if(p.stage==='guide'){this.stop(p);this.setState(p,'guiding');p.heading=0;this.log(`${p.id} 현장 도착`,'담당 위치에서 참가자의 이동을 안내합니다.','success');}
        else if(p.stage==='seat'&&p.seat){this.stop(p);this.setState(p,'working');p.heading=p.seat.heading;p.goalName=`${p.seat.table} · 지정 좌석`;p.nextAction=this.time+70+p.ordinal%30;}
        else if(p.stage==='visit'){this.stop(p);this.setState(p,'visiting');p.heading=0;p.nextAction=this.time+6;if(p.id==='J1')this.log('팀별 심사 진행',`${p.id} · ${p.goalName}`);}
        else {this.stop(p);this.setState(p,'idle');p.nextAction=this.time+3+(p.ordinal%4);}
      }
    }
    for(const e of this.exits){
      if(!e.open)continue;const def=EXITS.find(x=>x.id===e.id)!;
      // Physical order governs the two-lane queue. This prevents an early arrival at
      // the back from trying to pass stationary people already at the doorway.
      e.queue.sort((a,b)=>this.people.find(p=>p.id===b)!.position.z-this.people.find(p=>p.id===a)!.position.z);
      // Queue positions are part of the same navigable world, not an independent counter.
      for(let i=0;i<e.queue.length;i++){
        const p=this.people.find(x=>x.id===e.queue[i])!;
        const target=this.navigation.closest(vector(def.x+(i%2===0?-.24:.24),5.95-Math.floor(i/2)*.58));
        if(p.agent&&distance(p.position,target)>.2){p.agent.maxSpeed=.85;p.agent.requestMoveTarget(target);}else if(p.agent){p.agent.resetMoveTarget();p.agent.maxSpeed=0;p.heading=0;}
      }
      if(this.time>=e.nextRelease&&e.queue.length){
        const p=this.people.find(x=>x.id===e.queue[0])!;
        if(distance(p.position,vector(def.x,5.95))<1.3){
          e.queue.shift();e.nextRelease=this.time+1/def.capacity;
          this.move(p,vector(def.x,8.55),`${e.id} 출입구 통과`,'release');
        }
      }
    }
    if(this.time-this.lastHistory>=1){
      this.lastHistory=this.time;const stats=this.snapshot();this.history.push({time:this.time,inside:stats.inside,moving:stats.moving,waiting:stats.waiting});this.history=this.history.slice(-90);
    }
  }
  snapshot():Snapshot{
    const count=(state:State)=>this.people.filter(p=>p.state===state).length;
    const outside=count('outside');const inside=this.people.length-outside;
    const zones=[[-14.5,-4.7,'WEST · 팀 구역 A'],[-4.7,4.7,'CENTRAL · 팀 구역 B'],[4.7,14.5,'EAST · 팀 구역 C']] as const;
    return {ready:this.ready,error:this.error,time:this.time,running:this.running,speed:this.speed,scenario:this.scenario,guidance:this.guidance,guides:count('guiding'),story:this.story,storyStep:this.storyStep,total:this.people.length,inside,working:count('working'),moving:count('walking'),waiting:count('waiting'),outside,blocked:count('blocked'),occupancy:Math.round(inside/150*100),revision:this.revision,
      exits:this.exits.map(e=>({id:e.id,open:e.open,queue:e.queue.length,assigned:this.people.filter(p=>p.exit===e.id&&p.state!=='outside').length,departed:e.departed})),
      zones:zones.map(([min,max,name])=>{const people=this.people.filter(p=>p.state!=='outside'&&p.position.x>=min&&p.position.x<max);return{name,count:people.length,moving:people.filter(p=>p.speed>.1).length,pressure:people.filter(p=>p.state==='waiting').length};}),
      logs:[...this.logs],history:[...this.history],
    };
  }
}
export const world=new World();
