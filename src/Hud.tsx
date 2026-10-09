import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Bell, Box, BrainCircuit, CalendarDays, Check, ChevronRight, CircleHelp, Clock3, DoorOpen, Maximize2, Moon, Pause, Play, RotateCcw, ShieldCheck, Sun, Users, X } from 'lucide-react';
import { useUI } from './state';
import { world } from './simulation/world';
import type { Log } from './simulation/world';
import { AGENDA, eventTime, phaseAt } from './simulation/agenda';
import { useJudgment } from './decision/store';
import { openAgenda } from './AgendaPanel';

const shortNames=['체크인','DevDay','AWS 세션','오전 개발','점심','오후 개발','제출 점검','1차 심사','결선 발표','결선 심사','시상·퇴장'];
export function Header(){
  const ui=useUI(),d=ui.data,j=useJudgment();
  const tabs=[{id:'overview' as const,label:'공간 관제',icon:Box,value:d.inside},{id:'people' as const,label:'인물 탐색',icon:Users,value:d.total},{id:'events' as const,label:'상황 기록',icon:Activity,value:d.logs.length},{id:'agenda' as const,label:'행사 일정',icon:CalendarDays,value:'12'}];
  const panel=(id:typeof ui.panel)=>useUI.setState({panel:id,panelVisible:ui.panel===id?!ui.panelVisible:true,mobilePanel:true,cinema:false});
  return <header className="topbar">
    <button className="brand" aria-label="CrowdGuard 전체 조감도" onClick={()=>ui.setCamera('overview')}><span className="brand-symbol"><ShieldCheck size={22}/></span><span>CrowdGuard<small>VENUE OPERATIONS</small></span></button>
    <span className="header-divider"/>
    <nav className="status-navigation" aria-label="관제 메뉴">{tabs.map(({id,label,icon:Icon,value})=><button key={id} aria-label={label} aria-pressed={ui.panel===id&&ui.panelVisible} className={ui.panel===id&&ui.panelVisible?'active':''} onClick={()=>panel(id)}><Icon size={15}/><span>{label}</span><b>{value}</b></button>)}</nav>
    <div className="header-tools">
      <button className={`decision-status ${j.error?'unavailable':j.loading?'thinking':j.result?'evaluated':''}`} aria-label="OpenAI 판단 패널" onClick={()=>useUI.setState({panel:'agenda',panelVisible:true,mobilePanel:true,cinema:false})}><BrainCircuit size={14}/><span>OpenAI</span><small>{j.loading?'판단 중':j.error?'연결 확인':j.result?`${j.result.elapsedMs}ms`:'대기'}</small></button>
      <div className={`header-clock ${d.running?'':'paused'}`}><i/><span>{d.running?'LIVE':'PAUSED'}</span><b>{d.agenda?eventTime(d.agenda.minute):`${String(Math.floor(d.time/60)).padStart(2,'0')}:${String(Math.floor(d.time%60)).padStart(2,'0')}`}</b><small>KST</small></div>
      <button className="header-icon" aria-label={ui.night?'주간 조명':'야간 조명'} title={ui.night?'주간 조명':'야간 조명'} onClick={()=>ui.toggle('night')}>{ui.night?<Sun size={17}/>:<Moon size={17}/>}</button>
      <button className="header-icon" aria-label="프로젝트 정보" title="프로젝트 정보" onClick={()=>ui.toggle('help')}><CircleHelp size={17}/></button>
    </div>
  </header>;
}

export function SceneIdentity(){
  const d=useUI(s=>s.data);
  return <div className="scene-identity"><div><span className="venue-code">AWS / SEOUL</span><span className="simulation-label">SIMULATED DATA</span></div><h1>AWS Builder Day</h1><p>사람의 움직임을 읽는 디지털 트윈.</p><div className="identity-actions"><button onClick={()=>{useUI.setState({selected:null,camera:'overview',cameraRevision:useUI.getState().cameraRevision+1});if(d.story){world.story=false;world.publish();}else world.startStory();}} disabled={!d.ready}>{d.story?<Pause size={12}/>:<Play size={12} fill="currentColor"/>}{d.story?'시연 종료':'85초 라이브 투어'}<ArrowUpRight size={13}/></button><button aria-label="시뮬레이션 초기화" title="시뮬레이션 초기화" onClick={()=>d.agenda?openAgenda(600):world.reset()}><RotateCcw size={14}/></button></div></div>;
}

export function SituationSummary(){
  const d=useUI(s=>s.data),a=d.agenda,phase=phaseAt(a?.minute??600),closed=d.exits.filter(e=>!e.open);
  const active=d.working,other=d.inside-d.working-d.moving-d.waiting-d.blocked;
  return <section className="situation-summary"><div className="situation-venue"><span className="venue-avatar"><Box size={24}/></span><div><span className="eyebrow">HACKATHON HALL · SEOUL</span><h3>AWS 행사장</h3><p>120명 · 18개 팀 테이블 · 출입구 3개</p></div></div>
    <div className={`operational-state ${closed.length||d.blocked?'caution':''}`}><span><i/>{closed.length?`${closed.map(e=>e.id).join(' · ')} 출입구 통제`:'모든 출입구 개방'}</span><small>{d.expected?`${d.expected}명 입장 예정`:`현재 ${d.inside}명 체류`}</small></div>
    <div className="current-event"><div><CalendarDays size={14}/><strong>{a?phase.title:'자율 시뮬레이션'}</strong></div><span>{a?`${eventTime(phase.start)} — ${eventTime(phase.end)}`:'라이브 상황 대응'}</span><div className="event-track"><i style={{width:`${a?Math.max(1,(a.minute-phase.start)/(phase.end-phase.start)*100):d.story?d.time/85*100:0}%`}}/></div></div>
    <div className="activity-distribution"><div className="section-heading"><span>활동 분포</span><small>동일한 3D 상태에서 집계</small></div><div className="distribution-bar">{[{n:active,c:'work'},{n:d.moving,c:'move'},{n:d.waiting+d.blocked,c:'wait'},{n:Math.max(0,other),c:'other'}].map(({n,c})=><i key={c} className={c} style={{flexGrow:n,display:n?'block':'none'}} title={`${n}명`}/>)}</div><div className="distribution-labels"><span><i className="work"/>작업 <b>{active}</b></span><span><i className="move"/>이동 <b>{d.moving}</b></span><span><i className="wait"/>대기 <b>{d.waiting+d.blocked}</b></span><span><i className="other"/>참여 <b>{Math.max(0,other)}</b></span></div></div>
  </section>;
}

export function Journey(){
  const d=useUI(s=>s.data),a=d.agenda,index=a?AGENDA.findIndex(e=>e.id===a.phaseId):-1;
  return <section className="journey-dock" aria-label="행사 진행 상황"><div className="journey-heading"><div><span className="eyebrow">{a?'THE DAY, IN MOTION':'LIVE SCENARIO'}</span><h2>{a?'오늘의 행사 흐름':'상황 대응 시뮬레이션'}</h2></div><div className="journey-transport"><button className="play-button" disabled={!d.ready} aria-label={d.running?'일시정지':'재생'} onClick={()=>world.setRunning(!d.running)}>{d.running?<Pause size={14} fill="currentColor"/>:<Play size={14} fill="currentColor"/>}</button><div className="speed-control">{[1,2,4].map(speed=><button key={speed} aria-label={`${speed}배속`} aria-pressed={d.speed===speed} className={d.speed===speed?'selected':''} onClick={()=>world.setSpeed(speed)}>{speed}×</button>)}</div>{a&&<button className={`event-play ${a.auto?'active':''}`} aria-label={a.auto?'행사 시계 멈춤':'행사 시계 진행'} onClick={()=>world.setAgendaAuto(!a.auto)}><Clock3 size={13}/><span>{a.auto?'일정 진행 중':'일정 진행'}</span></button>}<button className="journey-expand" aria-label="행사 일정 열기" onClick={()=>useUI.setState({panel:'agenda',panelVisible:true,mobilePanel:true,cinema:false})}><Maximize2 size={13}/></button></div></div>
    {a?<div className="journey-steps">{AGENDA.map((event,i)=><button key={event.id} disabled={!d.ready} className={`journey-step ${i===index?'current':i<index?'passed':''}`} aria-label={`${eventTime(event.start)} ${event.title} 장면`} aria-current={i===index?'step':undefined} onClick={()=>openAgenda(event.start)}><span className="step-connection"/><span className="step-node">{i<index?<Check size={11}/>:i===index?<span/>:<b>{String(i+1).padStart(2,'0')}</b>}</span><strong>{shortNames[i]}</strong><time>{eventTime(event.start)}</time>{i===index&&<em>{a.auto?'진행 중':'관찰 중'}</em>}</button>)}</div>:<div className="scenario-options">{([['normal','평상시'],['break','휴식 시간'],['incident','출입구 통제']] as const).map(([id,title])=><button key={id} className={d.scenario===id?'selected':''} onClick={()=>{world.reset(id);useUI.getState().select(null);}}>{id==='normal'?<Box size={17}/>:id==='break'?<Users size={17}/>:<DoorOpen size={17}/>}<span>{title}</span><ChevronRight size={13}/></button>)}<button onClick={()=>openAgenda(600)}><CalendarDays size={17}/>행사 시간표로 돌아가기<ArrowUpRight size={13}/></button></div>}
  </section>;
}

export function EventToast(){
  const latest=useUI(s=>s.data.logs[0]),[event,setEvent]=useState<Log|null>(null);
  useEffect(()=>{if(!latest)return;setEvent(latest);const timer=setTimeout(()=>setEvent(null),6500);return()=>clearTimeout(timer);},[latest?.id]);
  if(!event)return null;
  return <div key={event.id} className={`event-toast ${event.level}`} role="status"><span className="toast-icon">{event.level==='warning'?<Bell size={16}/>:<Activity size={16}/>}</span><div><small>상황 업데이트</small><strong>{event.title}</strong></div><button aria-label="상황 알림 닫기" onClick={()=>setEvent(null)}><X size={14}/></button></div>;
}
