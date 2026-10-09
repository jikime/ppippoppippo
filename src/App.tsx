import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, CalendarDays, ArrowRight, ArrowUpRight, Box, Camera, Check, ChevronRight, CircleHelp, DoorOpen, Expand, Eye, Focus, Grid2X2, Layers3, LocateFixed, MapPin, Maximize2, Moon, MousePointer2, Navigation, Pause, Play, Radio, RotateCcw, Search, ShieldCheck, Sparkles, Sun, Users, X } from 'lucide-react';
import { useProgress } from '@react-three/drei';
import { Scene } from './scene/Scene';
import { useUI } from './state';
import { world } from './simulation/world';
import type { Scenario } from './simulation/world';
import { EXITS, roleNames, stateNames } from './simulation/layout';
import { AgendaPanel, openAgenda } from './AgendaPanel';
import { eventTime, phaseAt } from './simulation/agenda';

const clock=(time:number)=>`${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;
const scenarioNames={normal:'평상시 · 해커톤 진행',break:'휴식 시간 · 참가자 이동',incident:'출입구 통제 · 동선 재계획'};
const storyNames=['일상을 관찰하다','이동을 이해하다','변화를 감지하다','사람을 안내하다','흐름을 회복하다','시연 완료'];
class SceneBoundary extends Component<{children:ReactNode},{error:boolean}>{
  state={error:false};static getDerivedStateFromError(){return{error:true};}
  render(){return this.state.error?<div className="scene-error"><Box size={32}/><h2>3D 화면을 불러오지 못했습니다.</h2><p>WebGL을 지원하는 브라우저에서 다시 열어주세요.</p><button onClick={()=>location.reload()}>다시 불러오기</button></div>:this.props.children;}
}
function Logo(){return <div className="logo-mark"><ShieldCheck size={24} strokeWidth={1.6}/></div>;}
function Sidebar(){
  const panel=useUI(s=>s.panel),setPanel=useUI(s=>s.setPanel),toggle=useUI(s=>s.toggle),night=useUI(s=>s.night);
  return <aside className="sidebar"><Logo/><div className="sidebar-divider"/>
    <nav aria-label="주 메뉴">
      <button className={panel==='overview'?'active':''} title="공간 관제" aria-label="공간 관제" onClick={()=>setPanel('overview')}><Box size={21}/></button>
      <button className={panel==='people'?'active':''} title="인물 탐색" aria-label="인물 탐색" onClick={()=>setPanel('people')}><Users size={21}/></button>
      <button className={panel==='events'?'active':''} title="이벤트 기록" aria-label="이벤트 기록" onClick={()=>setPanel('events')}><Activity size={21}/></button>
      <button className={panel==='agenda'?'active':''} title="행사 시간표" aria-label="행사 시간표" onClick={()=>setPanel('agenda')}><CalendarDays size={21}/></button>
    </nav><div className="sidebar-bottom"><button title={night?'주간 조명':'야간 조명'} aria-label={night?'주간 조명':'야간 조명'} onClick={()=>toggle('night')}>{night?<Sun size={20}/>:<Moon size={20}/>}</button><button title="프로젝트 정보" aria-label="프로젝트 정보" onClick={()=>toggle('help')}><CircleHelp size={20}/></button><div className="avatar-monogram">CG</div></div>
  </aside>;
}
function Sparkline(){
  const history=useUI(s=>s.data.history);
  const values=history.slice(-35);const pts=values.map((p,i)=>`${i/Math.max(1,values.length-1)*105},${28-p.moving/120*27}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 110 32" aria-hidden="true"><path d="M0 30H110" stroke="#e8eeea"/><polyline points={pts} fill="none" stroke="#48ab8c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function Stats(){
  const d=useUI(s=>s.data);const opened=d.exits.filter(e=>e.open).length;
  return <div className="stats-row">
    <div className="stat-card"><div className="stat-top"><span>현재 공간 인원</span><Users size={15}/></div><div className="stat-value">{d.inside}<small>명</small><span className="stat-badge">전체 {d.total}</span></div><div className="stat-foot"><span className="tiny-dot"/>{d.expected?`입장 예정 ${d.expected}명`:'익명 시뮬레이션 인물'}</div></div>
    <div className="stat-card"><div className="stat-top"><span>이동 중인 인원</span><Navigation size={15}/></div><div className="stat-value">{d.moving}<small>명</small><Sparkline/></div><div className="stat-foot">착석 작업 <b>{d.working}명</b></div></div>
    <div className={`stat-card ${d.waiting>12||d.blocked>0?'attention':''}`}><div className="stat-top"><span>이동 대기</span><Activity size={15}/></div><div className="stat-value">{d.waiting+d.blocked}<small>명</small><span className={`stat-badge ${d.waiting>12||d.blocked>0?'amber':''}`}>{d.blocked?'경로 대기':d.waiting>12?'흐름 확인':d.waiting?'순차 이동':'대기 없음'}</span></div><div className="stat-foot">누적 퇴장 <b>{d.outside}명</b></div></div>
    <div className="stat-card"><div className="stat-top"><span>이용 가능한 출입구</span><DoorOpen size={15}/></div><div className="stat-value">{opened}<small>/ 3</small><div className="exit-dots">{d.exits.map(e=><i key={e.id} className={e.open?'':'closed'}/>)}</div></div><div className="stat-foot">{opened===3?'모든 출입구 개방':opened===0?'출입구 개방이 필요합니다':`${3-opened}개 출입구 통제 중`}</div></div>
  </div>;
}
function VirtualFeed(){
  const [camera,setCamera]=useState('1');const time=useUI(s=>s.data.time),agenda=useUI(s=>s.data.agenda);const enabled=useUI(s=>s.cctv),toggle=useUI(s=>s.toggle);
  return <section className="camera-section"><div className="section-heading"><span><Camera size={14}/> 가상 CCTV</span><button className="text-button" onClick={()=>toggle('cctv')} aria-label={enabled?'가상 CCTV 숨기기':'가상 CCTV 보기'}>{enabled?<Eye size={14}/>:<Camera size={14}/>}</button></div>
    {enabled?<><div className="camera-view"><canvas id="virtual-cctv" width={384} height={216} data-camera={camera}/><div className="camera-top"><span><i/>CAM 0{camera}</span><span>{agenda?eventTime(agenda.minute):`10:${clock(time)}`}</span></div><div className="camera-bottom"><span>3D 공간과 동기화</span><button title="실내 시점으로 보기" aria-label="실내 시점으로 보기" onClick={()=>useUI.getState().setCamera('floor')}><Expand size={13}/></button></div></div><div className="camera-tabs"><button className={camera==='1'?'selected':''} onClick={()=>{setCamera('1');}}>01 <span>동측 전경</span></button><button className={camera==='2'?'selected':''} onClick={()=>setCamera('2')}>02 <span>서측 전경</span></button></div></>:<button className="camera-off" onClick={()=>toggle('cctv')}>카메라 뷰 열기 <ArrowRight size={14}/></button>}
  </section>;
}
function SelectedPerson(){
  const id=useUI(s=>s.selected);useUI(s=>s.data.time);const p=world.people.find(p=>p.id===id);if(!p)return null;
  return <section className="selected-card"><div className="selected-heading"><div className={`person-avatar ${p.role}`}><Users size={20}/></div><div><strong>{p.id}</strong><span>{roleNames[p.role]}</span></div><button className="icon-button" title="선택 해제" aria-label="선택 해제" onClick={()=>useUI.getState().select(null)}><X size={15}/></button></div><div className="selected-status"><span className={`role-dot ${p.role}`}/>{stateNames[p.state]}</div><dl><div><dt>목적지</dt><dd>{p.goalName}</dd></div><div><dt>위치</dt><dd>{p.state==='outside'?'행사장 외부':p.position.x<-4.7?'서측 팀 구역':p.position.x>4.7?'동측 팀 구역':'중앙 팀 구역'}</dd></div></dl><button className="follow-button" disabled={p.state==='outside'||p.state==='notArrived'} onClick={()=>useUI.getState().setCamera('follow')}><Focus size={14}/>이 인물 따라가기<ArrowUpRight size={14}/></button></section>;
}
function Events({full=false}:{full?:boolean}){
  const logs=useUI(s=>s.data.logs);return <section className={`events-section ${full?'full':''}`}><div className="section-heading"><span>활동 기록</span><span className="muted-count">{logs.length}</span></div><div className="event-list">{logs.slice(0,full?80:3).map(log=><div className={`event-item ${log.level}`} key={log.id}><div className="event-symbol">{log.level==='success'?<Check size={11}/>:log.level==='warning'?<Activity size={11}/>:<Radio size={11}/>}</div><div><strong>{log.title}</strong><p>{log.detail}</p></div><time>{clock(log.time)}</time></div>)}</div></section>;
}
function Overview(){
  const d=useUI(s=>s.data);const selected=useUI(s=>s.selected);
  return <>{selected&&<SelectedPerson/>}<section className="zones-section"><div className="section-heading"><span>구역별 현황</span><span className="muted-label">현재 인원</span></div>{d.zones.map((z,i)=><div className="zone-row" key={z.name}><div className="zone-row-top"><span><i className={`zone-color zone-${i}`}/>{z.name.split(' · ')[1]}</span><strong>{z.count}<small>명</small></strong></div><div className="zone-track"><i style={{width:`${Math.min(100,z.count/55*100)}%`}}/></div><div className="zone-caption"><span>{z.pressure>6?'대기열 관찰 중':'정상 흐름'}</span><span>이동 {z.moving}명</span></div></div>)}</section>
    <section className="exit-section"><div className="section-heading"><span>출입구 제어</span><span className="muted-label">클릭하여 상태 변경</span></div>{d.exits.map((e,i)=><button className={`exit-row ${e.open?'':'closed'}`} key={e.id} onClick={()=>world.toggleExit(e.id)} aria-label={`${e.id} 출입구 ${e.open?'통제':'개방'}`}><span className="exit-letter">{e.id}</span><span className="exit-name">{EXITS[i].name}<small>대기 {e.queue}명 · 퇴장 {e.departed}명</small></span><span className="exit-state"><i/>{e.open?'개방':'통제'}</span><ChevronRight size={13}/></button>)}</section>
    <button className={`dispatch-button ${d.guidance?'dispatched':''}`} disabled={d.guidance||!d.ready} onClick={()=>world.dispatch()}>{d.guidance?<Check size={17}/>:<Navigation size={17}/>}<span>{d.guidance?(d.guides?`현장 안내 ${d.guides}명`:'현장 이동 중'):'운영요원 배치'}<small>{d.guidance?`${d.guides}/5명 도착 · 동선 분산 적용`:'5명의 운영요원에게 안내 요청'}</small></span><ArrowUpRight size={16}/></button>
    <VirtualFeed/>{!selected&&<Events/>}
  </>;
}
function PeoplePanel(){
  const [query,setQuery]=useState(''),[role,setRole]=useState('all');useUI(s=>s.data.time);
  const selected=useUI(s=>s.selected);const people=world.people.filter(p=>(role==='all'||p.role===role)&&(p.id.toLowerCase().includes(query.toLowerCase())||roleNames[p.role].includes(query)));
  return <>{selected&&<SelectedPerson/>}<div className="people-filters"><label className="search-input"><Search size={15}/><input aria-label="인물 검색" placeholder="ID 또는 역할 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="역할 필터" value={role} onChange={e=>setRole(e.target.value)}><option value="all">모든 역할</option>{Object.entries(roleNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div className="people-count">{people.length}명의 익명 인물</div><div className="people-list">{people.map(p=><button key={p.id} className={selected===p.id?'selected':''} onClick={()=>useUI.getState().select(p.id)}><span className={`role-dot ${p.role}`}/><span><b>{p.id}</b><small>{roleNames[p.role]}</small></span><em>{stateNames[p.state]}</em><ChevronRight size={13}/></button>)}{!people.length&&<div className="empty-state">검색 결과가 없습니다.</div>}</div></>;
}
function Operations(){
  const panel=useUI(s=>s.panel),d=useUI(s=>s.data),mobilePanel=useUI(s=>s.mobilePanel);
  return <aside className={`operations-panel ${mobilePanel?'mobile-open':''}`}><div className="operations-header"><div><span className="eyebrow">OPERATIONS</span><h2>{panel==='overview'?'공간의 흐름':panel==='people'?'사람들의 움직임':panel==='agenda'?'행사 시간표':'상황 타임라인'}</h2></div><span className={`live-pill ${!d.running?'paused':''}`}><i/>{d.running?'LIVE':'PAUSED'}</span><button className="mobile-panel-close icon-button" aria-label="관제 패널 닫기" onClick={()=>useUI.getState().toggle('mobilePanel')}><X size={17}/></button></div><div className="mobile-panel-tabs">{(['overview','people','events','agenda'] as const).map((tab,i)=><button key={tab} className={panel===tab?'selected':''} onClick={()=>useUI.getState().setPanel(tab)}>{['공간 관제','인물 탐색','이벤트','시간표'][i]}</button>)}</div><div className="operations-content">{panel==='overview'?<Overview/>:panel==='people'?<PeoplePanel/>:panel==='agenda'?<AgendaPanel/>:<Events full/>}</div><div className="panel-footer"><ShieldCheck size={13}/><span>공간을 이해하고, 사람을 지키다.</span></div></aside>;
}
function ViewControls(){
  const ui=useUI();
  return <div className="view-controls"><div className="view-mode"><button className={ui.camera==='overview'?'selected':''} onClick={()=>ui.setCamera('overview')} title="전체 조감도 (1)"><Box size={14}/><span>3D 조감도</span></button><button className={ui.camera==='top'?'selected':''} onClick={()=>ui.setCamera('top')} title="평면 보기 (2)"><Grid2X2 size={14}/><span>평면</span></button><button className={ui.camera==='floor'?'selected':''} onClick={()=>ui.setCamera('floor')} title="실내 시점 (3)"><Eye size={14}/><span>실내</span></button></div><div className="layer-controls"><button className={ui.routes?'selected':''} onClick={()=>ui.toggle('routes')} title="이동 경로 표시" aria-label="이동 경로 표시"><Navigation size={16}/></button><button className={ui.heatmap?'selected':''} onClick={()=>ui.toggle('heatmap')} title="인원 분포 표시" aria-label="인원 분포 표시"><Layers3 size={16}/></button><button className={ui.walls?'selected':''} onClick={()=>ui.toggle('walls')} title="측면 벽 표시" aria-label="측면 벽 표시"><Box size={16}/></button><button onClick={()=>ui.setCamera('overview')} title="시점 초기화" aria-label="시점 초기화"><LocateFixed size={16}/></button><span/><button className={ui.cinema?'selected':''} onClick={()=>ui.toggle('cinema')} title="장면 집중 모드" aria-label="장면 집중 모드"><Maximize2 size={16}/></button><button className="mobile-panel-button" aria-label="관제 패널 열기" onClick={()=>ui.toggle('mobilePanel')}><Activity size={16}/></button></div></div>;
}
function Timeline(){
  const d=useUI(s=>s.data);
  const change=(s:Scenario)=>{world.reset(s);useUI.getState().select(null);if(useUI.getState().camera==='follow')useUI.getState().setCamera('overview');};
  return <div className="timeline"><div className="transport"><button className="play-button" disabled={!d.ready} title={d.running?'일시정지 (Space)':'재생 (Space)'} aria-label={d.running?'일시정지':'재생'} onClick={()=>world.setRunning(!d.running)}>{d.running?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button><div className="timecode"><b>{d.agenda?eventTime(d.agenda.minute):clock(d.time)}</b><span>{d.agenda?'EVENT TIME · KST':'SIMULATION TIME'}</span></div><div className="speed-control">{[1,2,4].map(speed=><button key={speed} className={d.speed===speed?'selected':''} onClick={()=>world.setSpeed(speed)} aria-label={`${speed}배속`}>{speed}×</button>)}</div></div><div className="timeline-separator"/>{d.agenda?<div className="event-transport"><CalendarDays size={14}/><span><b>{phaseAt(d.agenda.minute).title}</b><small>{d.agenda.auto?'시간표 자동 진행':'현재 시간 유지 · 인물 동작 중'}</small></span><button onClick={()=>world.setAgendaAuto(!d.agenda!.auto)} aria-label={d.agenda.auto?'행사 시계 멈춤':'행사 시계 진행'}>{d.agenda.auto?<Pause size={13}/>:<Play size={13}/>}</button></div>:<div className="scenarios"><span>SCENARIO</span><div>{([['normal','평상시'],['break','휴식 시간'],['incident','출입구 통제']] as const).map(([s,label])=><button key={s} className={d.scenario===s?'selected':''} disabled={!d.ready} onClick={()=>change(s)}>{s==='normal'?<Box size={13}/>:s==='break'?<Users size={13}/>:<DoorOpen size={13}/>}<span>{label}</span></button>)}</div></div>}<div className="exit-progress"><div><span>퇴장 진행</span><strong>{d.outside}<small> / 108</small></strong></div><div className="progress-track"><i style={{width:`${d.outside/108*100}%`}}/></div></div></div>;
}
function About(){
  const toggle=useUI(s=>s.toggle),quality=useUI(s=>s.quality),setQuality=useUI(s=>s.setQuality);
  return <div className="modal-backdrop" onClick={()=>toggle('help')}><section className="about-modal" role="dialog" aria-modal="true" aria-label="CrowdGuard 프로젝트 정보" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="정보 닫기" onClick={()=>toggle('help')}><X size={20}/></button><Logo/><span className="eyebrow">A LIVING DIGITAL VENUE</span><h2>작은 움직임까지,<br/>하나의 공간으로.</h2><p>CrowdGuard는 AWS 행사장 참고 영상을 바탕으로 만든 인터랙티브 3D 관제 시뮬레이션입니다.</p><div className="about-facts"><span><b>120</b>익명 인물</span><span><b>4</b>서로 다른 역할</span><span><b>3</b>연결된 출입구</span></div><p className="about-note">인물과 관제 수치는 시뮬레이션에서 계산합니다. 실제 CCTV·영상 AI는 연결하지 않았으며, 공간 치수와 출입구 구성은 시연을 위한 가정입니다. 대기·분산 모델은 실제 안전성 평가를 대신하지 않습니다.</p><div className="quality-selector"><span>렌더링 품질</span><button className={quality==='high'?'selected':''} onClick={()=>setQuality('high')}>고화질</button><button className={quality==='balanced'?'selected':''} onClick={()=>setQuality('balanced')}>성능 우선</button></div><div className="shortcuts"><span><kbd>Space</kbd> 재생·정지</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 시점 변경</span><span><kbd>Esc</kbd> 선택 해제</span></div></section></div>;
}
export default function App(){
  const d=useUI(s=>s.data),help=useUI(s=>s.help),cinema=useUI(s=>s.cinema),night=useUI(s=>s.night);const progress=useProgress();
  useEffect(()=>{void world.initialize().then(()=>{if(!world.agenda)world.startAgenda(600);});const key=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.matches('input,select,textarea'))return;if(e.code==='Space'){e.preventDefault();world.setRunning(!world.running);}if(e.key==='1')useUI.getState().setCamera('overview');if(e.key==='2')useUI.getState().setCamera('top');if(e.key==='3')useUI.getState().setCamera('floor');if(e.key==='Escape')useUI.setState({selected:null,help:false,cinema:false});};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  useEffect(()=>{if(import.meta.env.DEV)(window as unknown as {crowdguard:typeof world}).crowdguard=world;},[]);
  return <div className={`app ${cinema?'cinema':''} ${night?'night-mode':''}`}><Sidebar/>
    <div className="app-body"><header className="topbar"><div className="brand-name">CrowdGuard<span className="brand-beta">VENUE</span></div><div className="breadcrumb"><span>/</span>워크스페이스<ChevronRight size={12}/><strong>AWS Builder Day</strong></div><div className="topbar-right"><button className="source-pill" onClick={()=>useUI.getState().toggle('help')}><span/>SIMULATION<CircleHelp size={12}/></button><span className="topbar-date">2026. 10. 09</span><div className="user-avatar">JK</div></div></header>
    <main className="workspace"><div className="venue-heading"><div><div className="venue-kicker"><span className="location-symbol"><MapPin size={11}/></span> SEOUL · HACKATHON HALL</div><h1>AWS Builder Day<span className="heading-tag">Digital Twin</span></h1><p>아이디어가 자라는 공간, 안전하게 이어지는 움직임.</p></div><div className="heading-actions"><button className="agenda-heading-button" aria-label="행사 일정 열기" onClick={()=>{if(!d.agenda)openAgenda(600);useUI.setState({panel:'agenda',mobilePanel:true});}}><CalendarDays size={15}/><span>행사 일정</span></button><button className="reset-button" title="시뮬레이션 초기화" aria-label="시뮬레이션 초기화" disabled={!d.ready} onClick={()=>{d.agenda?world.startAgenda(600):world.reset();useUI.getState().select(null);useUI.getState().setCamera('overview');}}><RotateCcw size={16}/></button><button className="demo-button" disabled={!d.ready} onClick={()=>{if(d.story){world.story=false;world.publish();}else{useUI.getState().select(null);useUI.getState().setCamera('overview');world.startStory();}}}>{d.story?<Pause size={14}/>:<Play size={14} fill="currentColor"/>}{d.story?'시연 종료':'라이브 시연'}<span>{d.story?'LIVE':'85s'}</span></button></div></div>
    <Stats/>
    <SceneBoundary><Scene/></SceneBoundary>
    <div className="scene-caption"><span className={`scene-status ${d.scenario==='incident'?'warning':''}`}><i/>{d.agenda?`${eventTime(d.agenda.minute)} · ${phaseAt(d.agenda.minute).title}`:scenarioNames[d.scenario]}</span><span className="scene-note">실제 행사장 참고 모델 · 가상 인물</span></div>
    {d.story&&<div className="story-card"><div className="story-icon"><Sparkles size={17}/></div><div><span>LIVE SCENARIO · 0{Math.min(5,d.storyStep+1)}</span><strong>{storyNames[d.storyStep]}</strong></div><div className="story-progress"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/><circle cx="18" cy="18" r="15" strokeDasharray={`${d.time/85*94} 94`}/></svg><span>{Math.max(0,85-Math.floor(d.time))}</span></div></div>}
    <ViewControls/><Operations/>
    <div className="scene-footer"><div className="legend">{Object.entries(roleNames).map(([role,label])=><span key={role}><i className={`role-dot ${role}`}/>{label}</span>)}</div><div className="interaction-hint"><MousePointer2 size={12}/><span>드래그하여 회전</span><span>·</span><span>스크롤하여 확대</span><span>·</span><span>인물을 클릭해 보세요</span></div></div>
    <Timeline/>
    {(!d.ready||progress.active)&&!d.error&&<div className="loading-screen"><Logo/><h2>공간에 생명을 불어넣는 중</h2><p>{!d.ready?'사람들이 이동할 수 있는 공간을 계산합니다.':'캐릭터와 행사장 에셋을 불러옵니다.'}</p><div className="loading-track"><i style={{width:`${Math.max(8,progress.progress)}%`}}/></div></div>}
    {d.error&&<div className="loading-screen"><h2>공간을 준비하지 못했습니다.</h2><p>{d.error}</p><button onClick={()=>location.reload()}>다시 시도</button></div>}
    </main></div>{help&&<About/>}
  </div>;
}
