import { create } from 'zustand';
import { world } from '../simulation/world';
import { permittedAction } from '../simulation/agenda';
import type { DecisionResult } from './contract';

type Evidence={revision:number;controlVersion:number;time:number};
type Judgment={configured:boolean|null;loading:boolean;note:string;auto:boolean;result:DecisionResult|null;evidence:Evidence|null;error:string;applied:boolean;
  setNote:(note:string)=>void;setAuto:(auto:boolean)=>void;check:()=>Promise<void>;evaluate:()=>Promise<void>;apply:()=>boolean;};
export const fresh=(e:Evidence|null)=>!!e&&e.revision===world.revision&&e.controlVersion===world.controlVersion&&world.time-e.time<=45;
let sequence=0;
export const useJudgment=create<Judgment>((set,get)=>({
  configured:null,loading:false,note:'',auto:false,result:null,evidence:null,error:'',applied:false,
  setNote:note=>set({note}),setAuto:auto=>set({auto}),
  check:async()=>{try{const response=await fetch('/api/jev/status');const body=await response.json();set({configured:response.ok&&body.configured===true});}catch{set({configured:false});}},
  evaluate:async()=>{
    if(get().loading)return;
    const seq=++sequence,d=world.snapshot(),evidence={revision:d.revision,controlVersion:world.controlVersion,time:d.time};
    set({loading:true,error:'',result:null,evidence:null,applied:false});
    try{
      const response=await fetch('/api/jev/evaluate',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(18000),body:JSON.stringify({
        phase:d.agenda?.phaseId??null,minute:d.agenda?.minute??0,inside:d.inside,moving:d.moving,waiting:d.waiting,blocked:d.blocked,
        expected:d.expected,guidance:d.guidance,exits:d.exits.map(({id,open,queue})=>({id,open,queue})),note:get().note,
      })});
      const body=await response.json();if(!response.ok)throw new Error(body.error||'Jev 판단을 가져오지 못했습니다.');
      if(seq!==sequence)return;
      if(!fresh(evidence)){set({error:'판단 중 행사 단계나 출입구 상태가 바뀌었습니다. 현재 상황으로 다시 요청해 주세요.'});return;}
      const result=body as DecisionResult;
      if(result.source!=='jev'||!permittedAction(result.action,d.agenda?.phaseId??null,d.agenda?.minute??0)){
        set({error:'현재 행사 단계에 적용할 수 없는 제안입니다. 운영 상태를 유지합니다.'});return;
      }
      set({result,evidence});
      if(get().auto&&result.confidence>=.65)get().apply();
    }catch(error){if(seq===sequence)set({error:error instanceof Error?error.message:'Jev 연결 오류가 발생했습니다.'});}
    finally{if(seq===sequence)set({loading:false});}
  },
  apply:()=>{
    const {result,evidence}=get();if(!result||!fresh(evidence)||result.confidence<.65)return false;
    const applied=world.applyDecision(result.action);set({applied});return applied;
  },
}));
