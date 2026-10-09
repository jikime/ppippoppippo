import { create } from 'zustand';
import { replayWorld } from './engine';
import { BASELINE, IMPROVED, manualKey, validConfig } from './model';
import type { Manual, PairResult, Replay, RunConfig } from './model';
import type { ReviewResult } from './review';

export interface Approval {key:string;runSeed:number;count:number;at:string;scope:'simulation-only'}
interface LabState {
  config:RunConfig;run:RunConfig|null;results:PairResult[];status:'idle'|'running'|'completed'|'cancelled'|'error';
  error:string;elapsedMs:number;workers:number;approval:Approval|null;
  replay:Replay|null;playing:boolean;time:number;speed:number;selected:string|null;
  review:ReviewResult|null;
  configure:(update:Partial<RunConfig>)=>void;start:()=>void;cancel:()=>void;
  inspect:(index:number,variant?:'before'|'after')=>void;switchVariant:(variant:'before'|'after')=>void;
  seek:(time:number)=>void;advance:(delta:number)=>void;approve:()=>void;
}
let pool:Worker[]=[];let token=0;let started=0;
const stopWorkers=()=>{pool.forEach(w=>w.terminate());pool=[];};
export const useLab=create<LabState>((set,get)=>({
  config:{seed:20261009,count:1000,hazard:'mixed',horizon:180,baseline:{...BASELINE},candidate:{...IMPROVED}},
  run:null,results:[],status:'idle',error:'',elapsedMs:0,workers:0,approval:null,
  replay:null,playing:false,time:0,speed:4,selected:null,review:null,
  configure:update=>{if(get().status==='running')return;set(s=>({config:{...s.config,...update},approval:null}));},
  start:()=>{
    if(get().status==='running')return;
    const config=structuredClone(get().config);
    if(!validConfig(config)){set({error:'시드·실험 수·관찰 시간을 확인해 주세요.'});return;}
    stopWorkers();const runToken=++token;started=performance.now();
    const workers=Math.min(4,Math.max(1,(navigator.hardwareConcurrency||4)-1));
    set({run:config,results:[],status:'running',error:'',elapsedMs:0,workers,approval:null,replay:null,playing:false,selected:null,time:0,review:null});
    let finished=0;const seen=new Set<number>();
    const fail=(message:string)=>{if(runToken!==token)return;token++;stopWorkers();set({status:'error',error:message,elapsedMs:performance.now()-started});};
    try {
      for(let i=0;i<workers;i++){
        const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});pool.push(worker);
        worker.onerror=()=>fail('실험 작업이 중단되었습니다. 수신이 완료된 결과만 보존했습니다.');
        worker.onmessage=(e:MessageEvent)=>{
          if(runToken!==token)return;
          if(e.data.type==='batch'){
            const results=e.data.results as PairResult[];
            for(const result of results){if(!Number.isInteger(result.index)||result.index<0||result.index>=config.count||seen.has(result.index)){fail('실험 결과의 중복 또는 범위 오류를 확인했습니다.');return;}seen.add(result.index);}
            set(s=>({results:[...s.results,...results],elapsedMs:performance.now()-started}));
          }
          else if(e.data.type==='error')fail(e.data.message);
          else if(e.data.type==='done'&&++finished===workers){
            if(seen.size!==config.count){fail('일부 세계의 결과를 받지 못했습니다. 완료 수를 확인해 주세요.');return;}
            stopWorkers();set(s=>({status:'completed',results:[...s.results].sort((a,b)=>a.index-b.index),elapsedMs:performance.now()-started}));
            const worst=[...get().results].sort((a,b)=>b.score-a.score||a.index-b.index)[0];
            if(worst)get().inspect(worst.index);
          }
        };
        worker.postMessage({config,start:i,stride:workers});
      }
    } catch{fail('이 브라우저에서 병렬 실험을 시작하지 못했습니다. Web Worker 지원을 확인해 주세요.');}
  },
  cancel:()=>{if(get().status!=='running')return;token++;stopWorkers();set({status:'cancelled',elapsedMs:performance.now()-started});},
  inspect:(index,variant='before')=>{
    const {run,results}=get(),result=results.find(r=>r.index===index);if(!run||!result)return;
    set({replay:replayWorld(run,result,variant),time:0,playing:true,selected:null});
  },
  switchVariant:variant=>{const {run,replay}=get();if(run&&replay)set({replay:replayWorld(run,replay.world,variant)});},
  seek:time=>set(s=>({time:Math.max(0,Math.min(s.replay?.horizon??0,time))})),
  advance:delta=>{const s=get();if(!s.playing||!s.replay)return;const t=Math.min(s.replay.horizon,s.time+Math.min(delta,.1)*s.speed);set({time:t,playing:t<s.replay.horizon});},
  approve:()=>{
    const {run,status,results,config}=get();
    if(status!=='completed'||!run||results.length!==run.count||JSON.stringify(config)!==JSON.stringify(run))return;
    set({approval:{key:manualKey(run.candidate),runSeed:run.seed,count:results.length,at:new Date().toISOString(),scope:'simulation-only'}});
  },
}));
export function candidateIsTested(run:RunConfig|null,manual:Manual){return !!run&&manualKey(run.candidate)===manualKey(manual);}
