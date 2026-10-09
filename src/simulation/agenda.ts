import { PATROL, TABLES, vector } from './layout.ts';
import type { Vec } from './layout.ts';
import type { Person, State } from './world.ts';

export const AGENDA = [
  {id:'checkin',start:540,end:570,title:'체크인 · 착석 및 장비 준비',speaker:'',screen:'Welcome,\nbuilders.',context:'Check in, find assigned seats and prepare equipment.'},
  {id:'recap',start:570,end:585,title:'행사 안내 · DevDay Recap',speaker:'Codex Ambassador 공준호',screen:'DevDay\nRecap',context:'Participants listen to the opening and DevDay recap.'},
  {id:'aws',start:585,end:600,title:'AWS Session',speaker:'AWS Tech Evangelist 최용호',screen:'Build with\nAWS.',context:'Participants listen to the AWS technical session.'},
  {id:'build_am',start:600,end:720,title:'팀별 개발 · 오전',speaker:'',screen:'Ideas into\nimpact.',context:'Teams build projects; judges visit teams and staff support them.'},
  {id:'lunch',start:720,end:780,title:'점심 식사 · 자율배식',speaker:'개발 병행 가능',screen:'Refuel.\nKeep building.',context:'Self-service lunch. Some participants continue coding. Others collect food and return to eat at their seats.'},
  {id:'build_pm',start:780,end:1020,title:'팀별 개발 · 오후',speaker:'17:00 개발·제출 마감',screen:'Make it\nhappen.',context:'Teams continue building before the 17:00 submission deadline.'},
  {id:'review',start:1020,end:1030,title:'제출물·발표 상태 점검',speaker:'운영진 점검 · 해커톤 플랫폼 종료',screen:'Submissions\nclosed.',context:'Submission has closed. Staff check submitted projects and presentation readiness. No more coding.'},
  {id:'tracks',start:1030,end:1110,title:'트랙별 1차 발표 심사',speaker:'저녁 식사 · 네트워킹 병행',screen:'Show your\nideas.',context:'Three simulated tracks present in parallel. Judges evaluate. Other participants listen, eat dinner or network.'},
  {id:'results',start:1110,end:1120,title:'리캡 · 결선 진출팀 발표',speaker:'점수 집계',screen:'Meet the\nfinalists.',context:'Host announces simulated finalists while judges tally scores. Participants listen.'},
  {id:'final',start:1120,end:1230,title:'결선 발표 및 심사',speaker:'가상 결선팀 시연',screen:'The final\npitch.',context:'Finalist teams present one at a time, judges evaluate and the audience watches.'},
  {id:'closing',start:1230,end:1260,title:'결과 발표 · 시상 · 단체사진',speaker:'퇴장 및 정리',screen:'Built together.\nThank you.',context:'Awards and applause, followed by a group photo, orderly departure and staff cleanup.'},
] as const;
export type PhaseId=typeof AGENDA[number]['id'];
export type Strategy='default'|'stagger_meals'|'focus_session'|'submission_help';
export type DecisionAction='observe'|'dispatch_guides'|'stagger_meals'|'focus_session'|'submission_help'|'guide_departure';
export const ACTION_LABELS:Record<DecisionAction,string>={observe:'현재 운영 유지',dispatch_guides:'현장 인력 배치',stagger_meals:'식사 인원 순차 이동',focus_session:'발표 청취 안내',submission_help:'제출·발표 점검 지원',guide_departure:'퇴장 동선 안내'};
export const phaseAt=(minute:number)=>AGENDA.find(p=>minute>=p.start&&minute<p.end)??(minute<540?AGENDA[0]:AGENDA[AGENDA.length-1]);
export const eventTime=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(Math.floor(minute%60)).padStart(2,'0')}`;
export const segmentAt=(minute:number)=>minute<1230?'main':minute<1240?'awards':minute<1250?'photo':'departure';
export interface AgendaState {minute:number;auto:boolean;phaseId:PhaseId;segment:string;enteredAt:number;strategy:Strategy;version:number}
export interface Intent {target:Vec;state:State;label:string;dwell:number;heading?:number;sitting?:boolean}
export const permittedAction=(action:DecisionAction,phase:PhaseId|null,minute:number)=>
  action==='observe'||action==='dispatch_guides'||
  action==='stagger_meals'&&(phase==='lunch'||phase==='tracks')||
  action==='focus_session'&&['recap','aws','tracks','results','final'].includes(phase??'')||
  action==='submission_help'&&phase==='review'||action==='guide_departure'&&phase==='closing'&&minute>=1250;

export function agendaIntent(p:Person,agenda:AgendaState,round:number):Intent {
  const phase=agenda.phaseId,i=p.ordinal;
  const seat=():Intent=>({target:vector(p.seat!.x,p.seat!.z),state:'working',label:`${p.seat!.table} · 팀별 개발`,dwell:22+i%15,heading:p.seat!.heading,sitting:true});
  const listen=():Intent=>({...seat(),state:'listening',label:'발표 청취',heading:Math.PI,dwell:18});
  const lounge=():Intent=>({target:vector(i%2?-13.3:13.3,-4.5+(i%10)*.93),state:'networking',label:'휴게 공간 · 네트워킹',dwell:8+i%7});
  const food=():Intent=>round%3===0?{target:vector(i%2?-13.35:13.35,-3.8+(i%3)*3),state:'serving',label:'자율배식 · 음식 받기',dwell:3+i%3}:{...seat(),state:round%3===1?'eating':'working',label:round%3===1?'자리에서 식사':'식사 후 개발 병행',dwell:18+i%12};
  if(p.role==='participant'){
    if(phase==='checkin')return {...seat(),state:'preparing',label:'체크인 완료 · 장비 준비',dwell:25};
    if(phase==='recap'||phase==='aws'||phase==='results')return listen();
    if(phase==='build_am'||phase==='build_pm')return round%4===1&&i%6===0?{...lounge(),state:'idle',label:'잠시 휴식'}:seat();
    if(phase==='lunch')return i%4===0?seat():food();
    if(phase==='review')return {...seat(),state:'submitting',label:'제출 완료 · 발표 파일 확인',dwell:25};
    if(phase==='tracks'){
      const track=i%3,team=Math.floor(i/6),current=(Math.floor((agenda.minute-1030)/8)+track)%6;
      if(i%6===0&&Math.floor(team/3)===current)return {target:vector(-8+(team%3)*8,-5.55),state:'presenting',label:`트랙 ${team%3+1} · T${String(team+1).padStart(2,'0')} 발표`,heading:0,dwell:5};
      if(agenda.strategy==='focus_session')return listen();
      if(i%5===1)return food();
      return i%5===2?lounge():listen();
    }
    if(phase==='final'){
      const team=Math.floor((agenda.minute-1120)/18)%6;
      return i===team*6?{target:vector(0,-5.6),state:'presenting',label:`가상 결선팀 ${team+1} · 발표`,heading:0,dwell:6}:listen();
    }
    if(agenda.segment==='photo')return {target:vector(-11.55+(i%36)*.66,-6.35+Math.floor(i/36)*.53),state:'photograph',label:'단체사진 · 촬영 위치',heading:0,dwell:60};
    return {...listen(),state:'applauding',sitting:true,label:'결과 발표 · 시상 축하',dwell:10};
  }
  if(p.role==='host')return {target:vector(-12.7,-5.65),state:['checkin','build_am','lunch','build_pm','review'].includes(phase)?'idle':'presenting',label:AGENDA.find(a=>a.id===phase)!.speaker||'행사 진행',heading:.35,dwell:20};
  if(p.role==='judge'){
    if(phase==='tracks'||phase==='final')return {target:vector(phase==='final'?-3+(i-113)*1.1:-9+Math.floor((i-113)/2)*8+(i%2)*1.1,-5.05),state:'judging',label:phase==='final'?'결선 심사 · 평가 기록':'트랙 발표 심사',heading:Math.PI,dwell:9};
    if(phase==='build_am'||phase==='build_pm'){const t=TABLES[(i+round*5)%TABLES.length];return{target:vector(t.x,t.z-1.43),state:'visiting',label:`${t.id} 팀 방문 · 피드백`,heading:0,dwell:7};}
    return {...lounge(),state:phase==='lunch'?'eating':phase==='results'?'judging':'listening',label:phase==='results'?'점수 집계':phase==='lunch'?'심사위원 식사':'행사 진행 관찰'};
  }
  // Both staff roles use the established support routes. Their duties and
  // labels differ, without changing the venue's tested traffic pattern.
  const medical=p.role==='paramedic';
  if(phase==='review'||agenda.strategy==='submission_help'){
    const t=TABLES[((i-108)*3+round)%TABLES.length];return{target:vector(t.x,t.z-1.43),state:medical?'idle':'checking',label:medical?`${t.id} 응급지원 순찰`:`${t.id} 제출물 · 발표 상태 점검`,dwell:5};
  }
  if(phase==='closing'&&agenda.segment==='departure'){
    const t=TABLES[((i-108)*3+round)%TABLES.length];return {target:vector(t.x,t.z-1.43),state:medical?'idle':'cleaning',label:medical?`${t.id} 응급지원 · 잔류 인원 확인`:`${t.id} 장비 · 좌석 정리`,dwell:6};
  }
  if(phase==='checkin')return {target:vector([-13.5,1.8,13.5,-6,6][i-108],[5,5.3,5,-5.8,-5.8][i-108]),state:medical?'idle':'checking',label:medical?'응급지원 대기 · 현장 확인':'체크인 · 좌석 안내',dwell:12};
  return {target:PATROL[(i+round)%PATROL.length],state:'guiding',label:medical?'응급지원 순찰 · 이동 보조':phase==='lunch'||phase==='tracks'?'배식 · 통로 안내':'행사장 운영 지원',dwell:5};
}
