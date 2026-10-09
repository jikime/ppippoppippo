import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BrainCircuit, Check, Clock3, Play, Pause, RotateCcw, Sparkles } from 'lucide-react';
import { AGENDA, ACTION_LABELS, eventTime, phaseAt } from './simulation/agenda';
import { stateNames } from './simulation/layout';
import { world } from './simulation/world';
import { useUI } from './state';
import { fresh, useJudgment } from './decision/store';

export function DecisionAutomation(){
  const j=useJudgment(),d=useUI(s=>s.data),lab=useUI(s=>s.panel==='lab'),last=useRef('');
  useEffect(()=>{
    const key=`${d.revision}:${d.agenda?.phaseId}:${d.agenda?.segment}`;
    if(lab||!j.auto||!j.configured||j.loading||!d.ready||last.current===key)return;
    // Manual scene jumps can be closer together than the server's rate limit.
    const timer=setTimeout(()=>{last.current=key;void useJudgment.getState().evaluate();},Math.max(0,j.nextRequestAt-Date.now()));
    return()=>clearTimeout(timer);
  },[lab,d.ready,d.revision,d.agenda?.phaseId,d.agenda?.segment,j.auto,j.configured,j.loading,j.nextRequestAt]);
  return null;
}
export function DecisionPanel(){
  const j=useJudgment(),d=useUI(s=>s.data);
  useEffect(()=>{void useJudgment.getState().check();},[]);
  const current=fresh(j.evidence),confident=(j.result?.confidence??0)>=.65;
  return <section className={`decision-card ${j.loading?'thinking':''}`} aria-busy={j.loading}><div className="decision-heading"><span><BrainCircuit size={17}/><b>OpenAI</b><small>Decisions</small></span><i className={j.configured?'connected':''}>{j.loading?'판단 중':j.error?'응답 확인':j.result?'응답 수신':j.configured?'준비됨':'연결 필요'}</i></div>
    <p>현재 일정과 공간 상태에서 다음 운영 조치를 판단합니다.</p>
    <textarea aria-label="OpenAI 운영 요청" maxLength={400} value={j.note} onChange={e=>j.setNote(e.target.value)} placeholder="예: 점심 이동이 겹치지 않게 안내해 줘" rows={2}/>
    <div className="decision-actions"><button disabled={j.loading||!j.configured||!d.ready} onClick={()=>void j.evaluate()}><Sparkles size={13}/>{j.loading?'OpenAI 판단 중…':'현재 상황 판단'}</button><label title="일정이 바뀔 때 판단하고, 기준을 충족한 제안을 시뮬레이션에 적용합니다."><input type="checkbox" checked={j.auto} onChange={e=>j.setAuto(e.target.checked)}/>자동 대응</label></div>
    {j.configured===false&&<p className="decision-message">OpenAI 서버 연결을 확인해 주세요. 일정 시뮬레이션은 계속 동작합니다.</p>}
    {j.error&&<p className="decision-message" role="status">{j.error}</p>}
    {j.result&&<div className="decision-result"><strong>{ACTION_LABELS[j.result.action]}</strong><div className="confidence-track"><i style={{width:`${j.result.confidence*100}%`}}/></div><small>선택 확신도 {Math.round(j.result.confidence*100)}% · {(j.result.elapsedMs/1000).toFixed(2)}초</small>
      <button disabled={j.applied||!current||!confident} onClick={()=>j.apply()}>{j.applied?<><Check size={13}/>시뮬레이션 적용됨</>:!current?'상황 변경 · 재판단 필요':!confident?'판단 불확실 · 운영 유지':<>제안 적용<ArrowRight size={13}/></>}</button>
      <details><summary>모델 응답 보기</summary><small>{j.result.model} · 입력 {j.result.usage.input_tokens.toLocaleString()} 토큰</small>{Object.entries(j.result.probabilities).sort((a,b)=>b[1]-a[1]).map(([action,p])=><div className="decision-probability" key={action}><span>{ACTION_LABELS[action as keyof typeof ACTION_LABELS]}</span><b>{Math.round(p*100)}%</b></div>)}<p>확신도와 조치별 확률은 모델의 응답 값입니다. 자동 대응 기준 65%는 이 시연의 설정값입니다.</p></details>
    </div>}
  </section>;
}
export const openAgenda=(minute:number,auto=false)=>{world.startAgenda(minute,auto);useUI.getState().select(null);useUI.getState().setCamera('overview');};
export function AgendaPanel(){
  const d=useUI(s=>s.data),a=d.agenda,phase=phaseAt(a?.minute??600),[jump,setJump]=useState('12:00');
  return <div className="agenda-panel"><section className="agenda-now"><span className="eyebrow">EVENT CLOCK · KST</span><div><b>{eventTime(a?.minute??600)}</b><button aria-label={a?.auto?'시간표 진행 멈춤':'시간표 자동 진행'} onClick={()=>a?world.setAgendaAuto(!a.auto):openAgenda(540,true)}>{a?.auto?<Pause size={14}/>:<Play size={14}/>}</button></div><strong>{a?phase.title:'행사 시간표를 시작해 보세요'}</strong><p>{phase.speaker||'참가자 · 운영요원 · 심사위원의 역할이 함께 바뀝니다.'}</p><small>{a?.auto?'행사 1분 = 시뮬레이션 1초':'선택한 시간 유지 · 인물은 계속 동작'}</small></section>
    <DecisionPanel/>
    <div className="agenda-tools"><button onClick={()=>openAgenda(540,true)} disabled={!d.ready}><RotateCcw size={12}/>하루 전체 재생</button><span>09:00 — 21:00</span></div>
    <div className="agenda-list">{AGENDA.map((event,index)=><div key={event.id}>{event.id==='review'&&<div className="deadline-marker"><i/>17:00 개발·제출 마감 · 플랫폼 종료</div>}<button aria-label={`${eventTime(event.start)} ${event.title}`} className={`agenda-item ${a?.phaseId===event.id?'current':''}`} disabled={!d.ready} onClick={()=>openAgenda(event.start)}><span className="agenda-number">{String(index+1).padStart(2,'0')}</span><span><small>{eventTime(event.start)}–{eventTime(event.end)}</small><b>{event.title}</b>{event.speaker&&<em>{event.speaker}</em>}</span>{a?.phaseId===event.id&&<i/>}</button></div>)}</div>
    <div className="agenda-jump"><Clock3 size={14}/><input type="time" aria-label="행사 이동 시각" value={jump} min="09:00" max="21:00" onChange={e=>setJump(e.target.value)}/><button disabled={!/^\d{2}:\d{2}$/.test(jump)||jump<'09:00'||jump>'21:00'} onClick={()=>{const [h,m]=jump.split(':').map(Number);openAgenda(h*60+m);}}>시간 이동</button></div>
    {a?.phaseId==='closing'&&<div className="closing-jumps">{[[1230,'시상'],[1240,'단체사진'],[1250,'퇴장·정리']].map(([time,label])=><button key={time} onClick={()=>openAgenda(Number(time))}>{label}</button>)}</div>}
    <section className="agenda-activity"><div className="section-heading">현재 역할별 행동</div>{d.activities.map(({state,count})=><div key={state}><span>{stateNames[state]}</span><b>{count}명</b></div>)}</section>
    <p className="agenda-note">일정은 제공받은 행사 시간표입니다. 배식 위치·발표 트랙·결선팀·마지막 30분의 세부 배분은 시연용 구성입니다. 시간을 직접 선택하면 해당 장면을 새로 시작합니다.</p>
  </div>;
}
