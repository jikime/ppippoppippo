import type { Approval } from './store';
import type { Manual, Rule } from './model';
import { manualKey } from './model';

export interface DetectionInput {id:string;kind:'fire'|'weapon';confidence:number;zone:0|1|2;source:'demo'|'external-json'}
export interface Detection extends DetectionInput {status:'candidate'|'rejected'|'confirmed'|'dispatched'|'acknowledged';manual:string|null;log:{at:string;text:string}[]}
export const detectionRule:Record<DetectionInput['kind'],Rule>={fire:'avoidHazard',weapon:'securityProtocol'};
export function parseDetection(value:unknown):DetectionInput {
  if(!value||typeof value!=='object')throw new Error('탐지 JSON 형식이 올바르지 않습니다.');
  const v=value as Record<string,unknown>;
  if(typeof v.id!=='string'||!/^[\w-]{1,64}$/.test(v.id)||(v.kind!=='fire'&&v.kind!=='weapon')||typeof v.confidence!=='number'||!Number.isFinite(v.confidence)||v.confidence<0||v.confidence>1||!Number.isInteger(v.zone)||(v.zone as number)<0||(v.zone as number)>2||(v.source!=='demo'&&v.source!=='external-json'))throw new Error('id, kind, confidence(0~1), zone(0~2), source를 확인해 주세요.');
  return {id:v.id,kind:v.kind,confidence:v.confidence,zone:v.zone as DetectionInput['zone'],source:v.source};
}
export function detectionTransition(event:Detection,action:'confirm'|'reject'|'dispatch'|'ack',manual:Manual,approval:Approval|null,at:string):Detection {
  let status=event.status,text='';const key=manualKey(manual);
  if(action==='reject'&&status==='candidate'){status='rejected';text='담당자가 탐지 후보를 기각했습니다.';}
  else if(action==='confirm'&&status==='candidate'){status='confirmed';text='담당자가 훈련 이벤트를 확인했습니다. 실제 현장 확인은 연결되지 않았습니다.';}
  else if(action==='dispatch'&&status==='confirmed'){
    if(!approval||approval.key!==key||!manual[detectionRule[event.kind]])throw new Error('해당 절차가 포함된 훈련 매뉴얼을 먼저 비교·승인해 주세요.');
    status='dispatched';text=event.kind==='weapon'?'모의 작업 생성: 안전관리자 확인 → 구역별 현장 판단 요청 → 담당자 수신 확인. 일반 화재 대피를 자동 적용하지 않습니다.':'모의 작업 생성: 위험 구역 확인 → 개인별 경로 후보 검토 → 운영요원 지원 배정.';
  }else if(action==='ack'&&status==='dispatched'){
    if(!approval||approval.key!==event.manual)throw new Error('승인된 매뉴얼이 변경되었습니다. 새 탐지 이벤트로 다시 검토해 주세요.');
    status='acknowledged';text='훈련 담당자의 수신 확인을 시뮬레이션했습니다. 실제 발송·하드웨어 작동 없음.';
  }else throw new Error('현재 이벤트 상태에서는 이 작업을 수행할 수 없습니다.');
  return {...event,status,manual:action==='dispatch'?key:event.manual,log:[...event.log,{at,text}]};
}
