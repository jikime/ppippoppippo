import { DevicePanel } from './device/DevicePanel';
import { startDeviceSync } from './device/store';
import { Component, Suspense, lazy, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Activity, ArrowUpRight, Box, Check, ChevronRight, DoorOpen, Eye, Focus, Grid2X2, Layers3, LocateFixed, Maximize2, MousePointer2, Navigation, Radio, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { useProgress } from '@react-three/drei';
import { Scene } from './scene/Scene';
import { useUI } from './state';
import { world } from './simulation/world';
import { EXITS, roleNames, roleEntries, roleColors, stateNames } from './simulation/layout';
import { AgendaPanel, DecisionAutomation } from './AgendaPanel';
import { Header, SceneIdentity, SituationSummary, Journey, EventToast } from './Hud';
import { useJudgment } from './decision/store';
import { PeoplePanel } from './people/PeoplePanel';
import { RoleDot } from './people/RoleDot';
import { LabPanel, LabStats } from './lab/LabPanel';
import { LabHUD } from './lab/LabHUD';
import { useLab } from './lab/store';
import { CctvMonitor } from './cctv/CctvMonitor';

const AnalyticsDashboard=lazy(()=>import('./analytics/AnalyticsDashboard'));

const clock=(time:number)=>`${String(Math.floor(time/60)).padStart(2,'0')}:${String(Math.floor(time%60)).padStart(2,'0')}`;
const storyNames=['일상을 관찰하다','이동을 이해하다','변화를 감지하다','사람을 안내하다','흐름을 회복하다','시연 완료'];
class SceneBoundary extends Component<{children:ReactNode},{error:boolean}>{
  state={error:false};static getDerivedStateFromError(){return{error:true};}
  render(){return this.state.error?<div className="scene-error"><Box size={32}/><h2>3D 화면을 불러오지 못했습니다.</h2><p>WebGL을 지원하는 브라우저에서 다시 열어주세요.</p><button onClick={()=>location.reload()}>다시 불러오기</button></div>:this.props.children;}
}
function Logo(){return <div className="logo-mark"><ShieldCheck size={24} strokeWidth={1.6}/></div>;}
function Sparkline(){
  const history=useUI(s=>s.data.history);
  const values=history.slice(-35);const pts=values.map((p,i)=>`${i/Math.max(1,values.length-1)*105},${28-p.moving/120*27}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 110 32" aria-hidden="true"><path d="M0 30H110" stroke="#e8eeea"/><polyline points={pts} fill="none" stroke="#48ab8c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function Stats(){
  const d=useUI(s=>s.data);const opened=d.exits.filter(e=>e.open).length;
  return <div className="stats-row">
    <div className="stat-card"><div className="stat-top"><span>현재 공간 인원</span><Users size={15}/></div><div className="stat-value"><span className="metric-number" key={d.inside}>{d.inside}</span><small>명</small><span className="stat-badge">전체 {d.total}</span></div><div className="stat-foot"><span className="tiny-dot"/>{d.expected?`입장 예정 ${d.expected}명`:'익명 시뮬레이션 인물'}</div></div>
    <div className="stat-card"><div className="stat-top"><span>이동 중인 인원</span><Navigation size={15}/></div><div className="stat-value"><span className="metric-number" key={d.moving}>{d.moving}</span><small>명</small><Sparkline/></div><div className="stat-foot">착석 작업 <b>{d.working}명</b></div></div>
    <div className={`stat-card ${d.waiting>12||d.blocked>0?'attention':''}`}><div className="stat-top"><span>이동 대기</span><Activity size={15}/></div><div className="stat-value"><span className="metric-number" key={d.waiting+d.blocked}>{d.waiting+d.blocked}</span><small>명</small><span className={`stat-badge ${d.waiting>12||d.blocked>0?'amber':''}`}>{d.blocked?'경로 대기':d.waiting>12?'흐름 확인':d.waiting?'순차 이동':'대기 없음'}</span></div><div className="stat-foot">누적 퇴장 <b>{d.outside}명</b></div></div>
    <div className="stat-card"><div className="stat-top"><span>이용 가능한 출입구</span><DoorOpen size={15}/></div><div className="stat-value"><span className="metric-number" key={opened}>{opened}</span><small>/ 3</small><div className="exit-dots">{d.exits.map(e=><i key={e.id} className={e.open?'':'closed'}/>)}</div></div><div className="stat-foot">{opened===3?'모든 출입구 개방':opened===0?'출입구 개방이 필요합니다':`${3-opened}개 출입구 통제 중`}</div></div>
  </div>;
}
function SelectedPerson(){
  const id=useUI(s=>s.selected);useUI(s=>s.data.time);const p=world.people.find(p=>p.id===id);if(!p)return null;
  return <section className="selected-card"><div className="selected-heading"><div className="person-avatar" style={{color:roleColors[p.role],backgroundColor:`${roleColors[p.role]}18`}}><Users size={20}/></div><div><strong>{p.id}</strong><span>{roleNames[p.role]}</span></div><button className="icon-button" title="선택 해제" aria-label="선택 해제" onClick={()=>useUI.getState().select(null)}><X size={15}/></button></div><div className="selected-status"><RoleDot role={p.role}/>{stateNames[p.state]}</div><dl><div><dt>목적지</dt><dd>{p.goalName}</dd></div><div><dt>위치</dt><dd>{p.state==='outside'?'행사장 외부':p.position.x<-4.7?'서측 팀 구역':p.position.x>4.7?'동측 팀 구역':'중앙 팀 구역'}</dd></div></dl><button className="follow-button" disabled={p.state==='outside'||p.state==='notArrived'} onClick={()=>useUI.getState().setCamera('follow')}><Focus size={14}/>이 인물 따라가기<ArrowUpRight size={14}/></button></section>;
}
function Events({full=false}:{full?:boolean}){
  const logs=useUI(s=>s.data.logs);return <section className={`events-section ${full?'full':''}`}><div className="section-heading"><span>활동 기록</span><span className="muted-count">{logs.length}</span></div><div className="event-list">{logs.slice(0,full?80:3).map(log=><div className={`event-item ${log.level}`} key={log.id}><div className="event-symbol">{log.level==='success'?<Check size={11}/>:log.level==='warning'?<Activity size={11}/>:<Radio size={11}/>}</div><div><strong>{log.title}</strong><p>{log.detail}</p></div><time>{clock(log.time)}</time></div>)}</div></section>;
}
function Overview(){
  const d=useUI(s=>s.data);const selected=useUI(s=>s.selected);
  return <><SituationSummary/>{selected&&<SelectedPerson/>}
    <section className="exit-section"><div className="section-heading"><span>출입구 제어</span><span className="muted-label">클릭하여 상태 변경</span></div>{d.exits.map((e,i)=><button className={`exit-row ${e.open?'':'closed'}`} key={e.id} onClick={()=>world.toggleExit(e.id)} aria-label={`${e.id} 출입구 ${e.open?'통제':'개방'}`}><span className="exit-letter">{e.id}</span><span className="exit-name">{EXITS[i].name}<small>대기 {e.queue}명 · 퇴장 {e.departed}명</small></span><span className="exit-state"><i/>{e.open?'개방':'통제'}</span><ChevronRight size={13}/></button>)}</section>
    <button className={`dispatch-button ${d.guidance?'dispatched':''}`} disabled={d.guidance||!d.ready} onClick={()=>world.dispatch()}>{d.guidance?<Check size={17}/>:<Navigation size={17}/>}<span>{d.guidance?(d.guides?`현장 안내 ${d.guides}명`:'현장 이동 중'):'현장 인력 배치'}<small>{d.guidance?`${d.guides}/5명 도착 · 동선 분산 적용`:'운영요원 3명 · 응급구조사 2명'}</small></span><ArrowUpRight size={16}/></button>
    <section className="zones-section"><div className="section-heading"><span>구역별 현황</span><span className="muted-label">현재 인원</span></div>{d.zones.map((z,i)=><div className="zone-row" key={z.name}><div className="zone-row-top"><span><i className={`zone-color zone-${i}`}/>{z.name.split(' · ')[1]}</span><strong>{z.count}<small>명</small></strong></div><div className="zone-track"><i style={{width:`${Math.min(100,z.count/55*100)}%`}}/></div><div className="zone-caption"><span>{z.pressure>6?'대기열 관찰 중':'정상 흐름'}</span><span>이동 {z.moving}명</span></div></div>)}</section>
    {!selected&&<Events/>}
  </>;
}
function Operations(){
  const panel=useUI(s=>s.panel),d=useUI(s=>s.data),mobilePanel=useUI(s=>s.mobilePanel),visible=useUI(s=>s.panelVisible);
  if(!visible)return null;
  return <aside className={`operations-panel ${mobilePanel?'mobile-open':''}`}><div className="operations-header"><div><span className="eyebrow">OPERATIONS</span><h2>{panel==='overview'?'공간의 흐름':panel==='people'?'사람들의 움직임':panel==='agenda'?'행사 시간표':panel==='device'?'디바이스 알림':panel==='lab'?'다중 세계 실험실':'상황 타임라인'}</h2></div><span className={`live-pill ${!d.running?'paused':''}`}><i/>{panel==='lab'?'LAB':d.running?'LIVE':'PAUSED'}</span><button className="mobile-panel-close icon-button" aria-label="관제 패널 닫기" onClick={()=>useUI.setState({mobilePanel:false,panelVisible:false})}><X size={17}/></button></div><div className="mobile-panel-tabs">{(['overview','people','events','agenda','device','lab'] as const).map((tab,i)=><button key={tab} className={panel===tab?'selected':''} onClick={()=>useUI.getState().setPanel(tab)}>{['공간 관제','인물 탐색','이벤트','시간표','디바이스','실험실'][i]}</button>)}</div><div className="operations-content" key={panel}>{panel==='overview'?<Overview/>:panel==='people'?<PeoplePanel/>:panel==='agenda'?<AgendaPanel/>:panel==='device'?<DevicePanel/>:panel==='lab'?<LabPanel/>:<Events full/>}</div><div className="panel-footer"><ShieldCheck size={13}/><span>공간을 이해하고, 사람을 지키다.</span></div></aside>;
}
function ViewControls(){
  const ui=useUI();
  return <div className="view-controls"><div className="view-mode"><button className={ui.camera==='overview'?'selected':''} onClick={()=>ui.setCamera('overview')} aria-label="전체 조감도" title="전체 조감도 (1)"><Box size={14}/><span>3D 조감도</span></button><button className={ui.camera==='top'?'selected':''} onClick={()=>ui.setCamera('top')} aria-label="평면 보기" title="평면 보기 (2)"><Grid2X2 size={14}/><span>평면</span></button><button className={ui.camera==='floor'?'selected':''} onClick={()=>ui.setCamera('floor')} aria-label="실내 시점" title="실내 시점 (3)"><Eye size={14}/><span>실내</span></button></div><div className="layer-controls"><button className={ui.routes?'selected':''} onClick={()=>ui.toggle('routes')} title="이동 경로 표시" aria-label="이동 경로 표시"><Navigation size={16}/></button><button className={ui.heatmap?'selected':''} onClick={()=>ui.toggle('heatmap')} title="인원 분포 표시" aria-label="인원 분포 표시"><Layers3 size={16}/></button><button className={ui.walls?'selected':''} onClick={()=>ui.toggle('walls')} title="측면 벽 표시" aria-label="측면 벽 표시"><Box size={16}/></button><button onClick={()=>ui.setCamera('overview')} title="시점 초기화" aria-label="시점 초기화"><LocateFixed size={16}/></button><span/><button className={ui.cinema?'selected':''} onClick={()=>ui.toggle('cinema')} title="장면 집중 모드" aria-label="장면 집중 모드"><Maximize2 size={16}/></button><button className="mobile-panel-button" aria-label="관제 패널 열기" onClick={()=>useUI.setState({mobilePanel:true,panelVisible:true})}><Activity size={16}/></button></div></div>;
}
function About(){
  const toggle=useUI(s=>s.toggle),quality=useUI(s=>s.quality),setQuality=useUI(s=>s.setQuality);
  return <div className="modal-backdrop" onClick={()=>toggle('help')}><section className="about-modal" role="dialog" aria-modal="true" aria-label="JEONJO 프로젝트 정보" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="정보 닫기" onClick={()=>toggle('help')}><X size={20}/></button><Logo/><span className="eyebrow">A LIVING DIGITAL VENUE</span><h2>작은 움직임까지,<br/>하나의 공간으로.</h2><p>JEONJO는 AWS 행사장 참고 영상을 바탕으로 만든 인터랙티브 3D 관제 시뮬레이션입니다.</p><div className="about-facts"><span><b>120</b>익명 인물</span><span><b>4</b>서로 다른 역할</span><span><b>3</b>연결된 출입구</span></div><p className="about-note">인물과 관제 수치는 시뮬레이션에서 계산합니다. CAM1·CAM2는 현장 녹화 영상이며 실시간 CCTV·영상 AI 분석은 연결하지 않았습니다. 공간 치수와 출입구 구성은 시연을 위한 가정입니다. 대기·분산 모델은 실제 안전성 평가를 대신하지 않습니다.</p><div className="quality-selector"><span>렌더링 품질</span><button className={quality==='high'?'selected':''} onClick={()=>setQuality('high')}>고화질</button><button className={quality==='balanced'?'selected':''} onClick={()=>setQuality('balanced')}>성능 우선</button></div><div className="shortcuts"><span><kbd>Space</kbd> 재생·정지</span><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 시점 변경</span><span><kbd>Esc</kbd> 선택 해제</span></div></section></div>;
}
export default function App(){
  useEffect(()=>startDeviceSync(),[]);
  const panel=useUI(s=>s.panel),cinema=useUI(s=>s.cinema),labMode=panel==='lab',analyticsMode=panel==='analytics'&&!cinema;
  const previousRunning=useRef(true);
  useEffect(()=>{if(!labMode)return;previousRunning.current=world.running;world.setRunning(false);useUI.getState().setCamera('overview');return()=>{useLab.setState({playing:false});world.setRunning(previousRunning.current);};},[labMode]);
  const d=useUI(s=>s.data),help=useUI(s=>s.help),night=useUI(s=>s.night),panelVisible=useUI(s=>s.panelVisible);const progress=useProgress();
  useEffect(()=>{void useJudgment.getState().check();void world.initialize().then(()=>{if(!world.agenda)world.startAgenda(600);});const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){useUI.setState({selected:null,help:false,cinema:false});useLab.setState({selected:null});return;}if((e.target as HTMLElement)?.closest('input,select,textarea,button,[role="button"]'))return;if(e.code==='Space'){e.preventDefault();if(useUI.getState().panel==='lab')useLab.setState(s=>({playing:!s.playing,time:s.time>=(s.replay?.horizon??Infinity)?0:s.time}));else world.setRunning(!world.running);}if(e.key==='1')useUI.getState().setCamera('overview');if(e.key==='2')useUI.getState().setCamera('top');if(e.key==='3')useUI.getState().setCamera('floor');};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  useEffect(()=>{if(import.meta.env.DEV)(window as unknown as {crowdguard:typeof world}).crowdguard=world;},[]);
  return <div className={`app ${labMode?'lab-mode':''} ${analyticsMode?'analytics-mode':''} ${panel==='people'?'people-focus':''} ${cinema?'cinema':''} ${night?'night-mode':''} ${panelVisible?'':'panels-hidden'}`}>
    <main className="workspace"><div className="scene-host"><SceneBoundary><Scene/></SceneBoundary></div>{analyticsMode?<Suspense fallback={<div className="analytics-loading">분석 대시보드를 불러오는 중입니다.</div>}><AnalyticsDashboard/></Suspense>:<>
      {labMode?<><LabStats/><LabHUD/></>:<><SceneIdentity/><Stats/></>}<ViewControls/><Operations/>
      <aside className="floating-feed" aria-label="가상 및 실제 CCTV 영상"><CctvMonitor/></aside>
      {d.story&&<div className="story-card"><Sparkles size={16}/><span>LIVE TOUR</span><strong>{storyNames[d.storyStep]}</strong><b>{Math.max(0,85-Math.floor(d.time))}s</b></div>}
      <div className="scene-footer"><div className="legend" aria-label="캐릭터 역할 색상">{roleEntries.map(([role,label])=><span key={role}><RoleDot role={role}/>{label}</span>)}</div><div className="interaction-hint"><MousePointer2 size={12}/>드래그로 회전 · 스크롤로 확대</div></div>
      {!labMode&&<><EventToast/><Journey/></>}</>}
      {(!d.ready||progress.active)&&!d.error&&<div className="loading-screen"><Logo/><h2>공간에 생명을 불어넣는 중</h2><p>{!d.ready?'이동 공간을 계산합니다.':'캐릭터와 행사장 에셋을 불러옵니다.'}</p><div className="loading-track"><i style={{width:`${Math.max(8,progress.progress)}%`}}/></div></div>}
      {d.error&&<div className="loading-screen"><h2>공간을 준비하지 못했습니다.</h2><p>{d.error}</p><button onClick={()=>location.reload()}>다시 시도</button></div>}
    </main><Header/>{cinema&&<button className="cinema-restore" onClick={()=>useUI.setState({cinema:false})} aria-label="대시보드 다시 보기"><Grid2X2 size={15}/>대시보드 보기<kbd>Esc</kbd></button>}<DecisionAutomation/>{help&&<About/>}
  </div>;
}
