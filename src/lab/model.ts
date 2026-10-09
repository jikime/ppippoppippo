import type { Persona } from '../simulation/profiles.ts';

export const MODEL_VERSION = 'venue-event-queue/1.0';
export const HAZARDS = ['fire','blackout','security','allergy'] as const;
export type Hazard = typeof HAZARDS[number];
export const hazardNames: Record<Hazard,string> = {fire:'화재 구역',blackout:'정전·출구 통제',security:'보안 위협 의심',allergy:'점심·알레르기'};
export const RULES = {
  balancedExits: {title:'출입구 분산',detail:'거리와 예상 대기를 함께 계산해 이용 가능한 출구를 배정합니다.'},
  avoidHazard: {title:'위험 구역 경로 제외',detail:'지정된 위험 구역을 지나는 경로는 배정 후보에서 제외합니다.'},
  multimodalAlert: {title:'복수 채널 안내',detail:'음성 안내를 놓치는 페르소나에게 화면 안내를 함께 전달합니다.'},
  assistedEvacuation: {title:'이동 지원 담당 배정',detail:'지원 요청을 5명의 운영요원에게 순서대로 배정합니다.'},
  securityProtocol: {title:'보안 위협 확인 절차',detail:'일반 퇴장 안내를 중단하고 담당자 확인·수신 확인 절차를 실행합니다.'},
  allergyCheck: {title:'배식 전 알레르기 확인',detail:'식재료가 맞지 않으면 대체식 또는 담당자 확인 대기로 전환합니다.'},
} as const;
export type Rule = keyof typeof RULES;
export type Manual = Record<Rule,boolean>;
export const BASELINE: Manual = {balancedExits:false,avoidHazard:false,multimodalAlert:false,assistedEvacuation:false,securityProtocol:false,allergyCheck:false};
export const IMPROVED: Manual = {balancedExits:true,avoidHazard:true,multimodalAlert:true,assistedEvacuation:true,securityProtocol:true,allergyCheck:true};
export const manualKey = (m: Manual) => (Object.keys(RULES) as Rule[]).map(k=>m[k]?'1':'0').join('');
export interface RunConfig {seed:number;count:number;hazard:Hazard|'mixed';horizon:number;baseline:Manual;candidate:Manual}
export interface Point {x:number;z:number}
export interface Conditions {seed:number;hazard:Hazard;hazardPoint:Point;radius:number;closedExit:number;announcementDelay:number;capacityScale:number;alternativeMeal:boolean;minute:number}
export interface Metrics {
  unresolved:number;riskyRoutes:number;unassisted:number;allergyExposures:number;lateResponse:number;
  missingProtocol:number;maxQueue:number;completionSeconds:number;exitLoads:[number,number,number];
}
export type FindingKey = 'unresolved'|'riskyRoutes'|'unassisted'|'allergyExposures'|'lateResponse'|'missingProtocol'|'maxQueue';
export const FINDINGS: Record<FindingKey,{title:string;rule:Rule;weight:number;unit:string;meaning:string}> = {
  missingProtocol:{title:'보안 위협 대응 절차 공백',rule:'securityProtocol',weight:5,unit:'건',meaning:'위협 후보를 확인하고 응답을 추적할 절차가 없습니다.'},
  riskyRoutes:{title:'위험 구역을 지나는 동선',rule:'avoidHazard',weight:5,unit:'명',meaning:'모형의 위험 구역과 배정 경로가 교차했습니다.'},
  allergyExposures:{title:'알레르기 식재료 확인 누락',rule:'allergyCheck',weight:5,unit:'명',meaning:'페르소나의 알레르기 정보와 배식 식재료가 일치했습니다.'},
  unassisted:{title:'이동 지원 담당 미배정',rule:'assistedEvacuation',weight:4,unit:'명',meaning:'이동 지원이 필요한 페르소나에게 담당자가 배정되지 않았습니다.'},
  unresolved:{title:'제한 시간 내 대응 미완료',rule:'balancedExits',weight:4,unit:'명',meaning:'대피·수신 확인·적합 배식 중 해당 시나리오의 완료 조건을 충족하지 못했습니다.'},
  lateResponse:{title:'안내 수신·반응 지연',rule:'multimodalAlert',weight:3,unit:'명',meaning:'모형의 관찰 기준인 60초 이내에 첫 대응을 시작하지 못했습니다.'},
  maxQueue:{title:'특정 출구로 대기 집중',rule:'balancedExits',weight:3,unit:'명 초과',meaning:'한 출입구의 동시 대기가 관찰 기준 12명을 넘었습니다.'},
};
export const findingValue = (m:Metrics,k:FindingKey) => k === 'maxQueue' ? Math.max(0,m.maxQueue-12) : m[k];
export interface PairResult {index:number;conditions:Conditions;before:Metrics;after:Metrics;score:number}
export interface TraceAgent {persona:Persona;path:Point[];length:number;depart:number;arrive:number;finish:number;release?:number;queueAhead?:number[];exit:number|null;outcome:'evacuated'|'unverified-exit'|'acknowledged'|'meal'|'held';risky:boolean;allergyMismatch:boolean;assisted:boolean}
export interface TraceEvent {time:number;title:string;detail:string}
export interface Replay {world:PairResult;variant:'before'|'after';agents:TraceAgent[];events:TraceEvent[];horizon:number}
export const regressionKeys=(r:PairResult)=>(Object.keys(FINDINGS) as FindingKey[]).filter(k=>findingValue(r.after,k)>findingValue(r.before,k));
export interface Finding {key:FindingKey;worlds:number;afterWorlds:number;peak:number;total:number;afterTotal:number;regressedWorlds:number;score:number;worldIndex:number;evidenceVariant:'before'|'after'}
export function rankFindings(results:PairResult[]):Finding[] {
  return (Object.keys(FINDINGS) as FindingKey[]).map(key=>{
    let worlds=0,afterWorlds=0,peak=0,total=0,afterTotal=0,worldIndex=0,regressedWorlds=0;
    let evidenceVariant:Finding['evidenceVariant']='before';
    for (const r of results) {
      const b=findingValue(r.before,key),a=findingValue(r.after,key);
      if(b>0)worlds++;if(a>0)afterWorlds++;total+=b;afterTotal+=a;
      if(a>b)regressedWorlds++;
      const worst=Math.max(a,b);
      if(worst>peak){peak=worst;worldIndex=r.index;evidenceVariant=a>b?'after':'before';}
    }
    // Severity is a user-reviewable planning weight, not a casualty probability.
    const score=worlds||afterWorlds ? Math.round(FINDINGS[key].weight/5*40 + Math.min(1,peak/(key==='missingProtocol'?1:120))*25 + Math.max(worlds,afterWorlds)/Math.max(1,results.length)*20 + 15) : 0;
    return {key,worlds,afterWorlds,peak,total,afterTotal,regressedWorlds,score,worldIndex,evidenceVariant};
  }).filter(f=>f.worlds>0||f.afterWorlds>0).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
}
export function validConfig(c:RunConfig) {
  return Number.isInteger(c.seed)&&c.seed>=0&&c.seed<=0xffffffff&&Number.isInteger(c.count)&&c.count>0&&c.count<=10000&&
    (c.hazard==='mixed'||HAZARDS.includes(c.hazard))&&Number.isInteger(c.horizon)&&c.horizon>=60&&c.horizon<=600&&
    [c.baseline,c.candidate].every(m=>m&&Object.keys(RULES).every(k=>typeof m[k as Rule]==='boolean'));
}
