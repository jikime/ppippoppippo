import { useState } from 'react';
import { create } from 'zustand';
import { Check, Radio, ShieldCheck, X } from 'lucide-react';
import { useLab } from './store';
import { detectionTransition, parseDetection } from './detection';
import type { Detection, DetectionInput } from './detection';

const useDetections=create<{events:Detection[];error:string}>(()=>({events:[],error:''}));
const labels={candidate:'확인 대기',rejected:'기각',confirmed:'담당자 확인',dispatched:'모의 작업 생성',acknowledged:'훈련 수신 확인'};
export function DetectionPanel(){
  const {events,error}=useDetections(),approval=useLab(s=>s.approval),[json,setJson]=useState('');
  const add=(input:unknown)=>{
    try{const item=parseDetection(input);if(events.some(e=>e.id===item.id))throw new Error('이미 처리한 이벤트 ID입니다.');useDetections.setState({error:'',events:[{...item,status:'candidate' as const,manual:null,log:[{at:new Date().toISOString(),text:`${item.source==='demo'?'시연용 탐지':'외부 JSON'} 후보 수신 · 모델 점수 ${Math.round(item.confidence*100)}% (실제 위험 확률 아님)`}]},...events].slice(0,30)});}
    catch(e){useDetections.setState({error:e instanceof Error?e.message:'입력 오류'});}
  };
  const act=(id:string,action:Parameters<typeof detectionTransition>[1])=>{
    try{const lab=useLab.getState();useDetections.setState({error:'',events:events.map(e=>e.id===id?detectionTransition(e,action,lab.config.candidate,lab.approval,new Date().toISOString()):e)});}
    catch(e){useDetections.setState({error:e instanceof Error?e.message:'처리 오류'});}
  };
  return <div className="lab-detection"><div className="lab-callout"><Radio size={17}/><div><b>탐지 → 확인 → 매뉴얼 → 수신 확인</b><p>YOLO 실시간 연결 전, 이벤트 형식과 대응 절차를 검증합니다. 모든 조치는 모의 작업으로 기록됩니다.</p></div></div>
    <div className="lab-inline-buttons">{(['fire','weapon'] as DetectionInput['kind'][]).map(kind=><button key={kind} onClick={()=>add({id:crypto.randomUUID(),kind,confidence:.87,zone:1,source:'demo'})}>+ {kind==='fire'?'화재':'총기 의심'} 후보 입력</button>)}</div>
    <details className="lab-details"><summary>외부 탐지 JSON 입력</summary><p>실제 추론 서버는 아직 연결되지 않았습니다. 인입 규격 검증용입니다.</p><code>{'{"id":"event-001","kind":"weapon","confidence":0.87,"zone":1,"source":"external-json"}'}</code><textarea aria-label="탐지 이벤트 JSON" value={json} maxLength={2000} onChange={e=>setJson(e.target.value)} rows={4}/><button onClick={()=>{try{const input=JSON.parse(json);add({...input,source:'external-json'});}catch{useDetections.setState({error:'JSON 문법을 확인해 주세요.'});}}}>입력 검증·수신</button></details>
    {!approval&&<p className="lab-note">후보 확인은 가능합니다. 모의 작업 생성에는 비교를 완료한 훈련 매뉴얼 승인이 필요합니다.</p>}
    {error&&<p className="lab-error" role="status">{error}</p>}
    {!events.length&&<div className="lab-empty"><ShieldCheck size={26}/><strong>탐지 대기</strong><p>위의 후보 입력 버튼으로 대응 기록을 시작하세요.</p></div>}
    {events.map(e=><article className="detection-card" key={e.id}><header><b>{e.kind==='fire'?'화재 후보':'총기 의심 후보'} · {['서측','중앙','동측'][e.zone]}</b><span>{labels[e.status]}</span></header><small>{e.source==='demo'?'합성 이벤트':'사용자 입력 JSON'} · {e.id.slice(0,12)}</small><ol>{e.log.map((l,i)=><li key={i}><time>{new Date(l.at).toLocaleTimeString('ko-KR',{hour12:false})}</time><span>{l.text}</span></li>)}</ol>
      <div className="lab-inline-buttons">{e.status==='candidate'?<><button onClick={()=>act(e.id,'confirm')}><Check size={12}/>훈련 이벤트 확인</button><button onClick={()=>act(e.id,'reject')}><X size={12}/>기각</button></>:e.status==='confirmed'?<button disabled={!approval} onClick={()=>act(e.id,'dispatch')}>승인된 절차로 모의 작업 생성</button>:e.status==='dispatched'?<button onClick={()=>act(e.id,'ack')}>수신 확인 시뮬레이션</button>:null}</div></article>)}
  </div>;
}
