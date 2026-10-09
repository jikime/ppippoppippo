import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import { ArrowRight,Camera,Expand,Eye,Maximize2,Minimize2,Pause,Play,RotateCcw,Volume2,VolumeX } from 'lucide-react';
import { useUI } from '../state';
import { eventTime } from '../simulation/agenda';
import './cctv.css';

const recordings=[{id:'cam1',label:'실제 CAM1',view:'스크린 방향'},{id:'cam2',label:'실제 CAM2',view:'출입구 방향'}] as const;
type Recording=typeof recordings[number];
type Source='virtual'|Recording['id'];
// Session-only viewing state; returning from another page resumes each recording.
const session={source:'virtual' as Source,virtualCamera:'1',cam1:{time:0,wanted:true,muted:true},cam2:{time:0,wanted:true,muted:true}};
const clock=(t:number)=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const asset=(name:string)=>`${import.meta.env.BASE_URL}media/cctv/${name}`;

function VirtualFeed({expanded}:{expanded:boolean}){
  const [camera,setCamera]=useState(session.virtualCamera);
  const time=useUI(s=>Math.floor(s.data.time)),minute=useUI(s=>s.data.agenda?.minute);
  return <><div className="camera-view"><canvas id="virtual-cctv" width={expanded?768:384} height={expanded?432:216} data-camera={camera}/><div className="camera-top"><span><i/>VIRTUAL {camera}</span><span>{minute!==undefined?eventTime(minute):clock(time)}</span></div><div className="camera-bottom"><span>3D 시뮬레이션과 동기화</span><button title="실내 시점으로 보기" aria-label="실내 시점으로 보기" onClick={()=>useUI.getState().setCamera('floor')}><Expand size={13}/></button></div></div><div className="camera-tabs">{['1','2'].map(id=><button key={id} className={camera===id?'selected':''} aria-pressed={camera===id} onClick={()=>{session.virtualCamera=id;setCamera(id);}}>0{id} <span>{id==='1'?'동측 전경':'서측 전경'}</span></button>)}</div></>;
}

function RecordingPlayer({camera,selected,visible}:{camera:Recording;selected:boolean;visible:boolean}){
  const video=useRef<HTMLVideoElement>(null),container=useRef<HTMLDivElement>(null);
  const [wanted,setWanted]=useState(session[camera.id].wanted),[muted,setMuted]=useState(session[camera.id].muted);
  const [playing,setPlaying]=useState(false),[time,setTime]=useState(session[camera.id].time),[duration,setDuration]=useState(0);
  const [buffering,setBuffering]=useState(true),[error,setError]=useState(''),[blocked,setBlocked]=useState(false);
  const [isFullscreen,setIsFullscreen]=useState(false),[fullscreenError,setFullscreenError]=useState('');
  const active=selected&&visible;
  useEffect(()=>{const update=()=>setIsFullscreen(document.fullscreenElement===container.current);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update);},[]);
  useEffect(()=>{
    const element=video.current;if(!element)return;
    let disposed=false;
    if(active&&wanted){void element.play().catch(e=>{if(!disposed&&e?.name!=='AbortError')setBlocked(true);});}
    else element.pause();
    return()=>{disposed=true;session[camera.id].time=element.currentTime;element.pause();};
  },[active,wanted,camera.id]);
  const togglePlayback=()=>{
    const next=!playing;session[camera.id].wanted=next;setWanted(next);
    if(next){setBlocked(false);void video.current?.play().catch(()=>setBlocked(true));}else video.current?.pause();
  };
  const seek=(value:number)=>{const v=video.current;if(v&&Number.isFinite(v.duration)){v.currentTime=Math.max(0,Math.min(v.duration,value));session[camera.id].time=v.currentTime;setTime(v.currentTime);}};
  const fullscreen=()=>{
    setFullscreenError('');const element=container.current;
    if(!element?.requestFullscreen){setFullscreenError('이 브라우저에서는 모니터의 크게 보기를 사용해 주세요.');return;}
    void (document.fullscreenElement===element?document.exitFullscreen():element.requestFullscreen()).catch(()=>setFullscreenError('전체 화면을 열지 못했습니다. 모니터의 크게 보기를 사용해 주세요.'));
  };
  return <div ref={container} className="cctv-player" hidden={!selected} role="tabpanel" id={`cctv-panel-${camera.id}`} aria-labelledby={`cctv-tab-${camera.id}`}>
    <div className="camera-view recorded-view">
      <video ref={video} src={asset(`${camera.id}.mp4`)} poster={asset(`${camera.id}.jpg`)} preload={active?'auto':'none'} muted={muted} loop playsInline aria-label={`${camera.label} 행사장 녹화 영상`}
        onLoadedMetadata={e=>{const v=e.currentTarget;setDuration(v.duration);if(session[camera.id].time>0)v.currentTime=Math.min(session[camera.id].time,Math.max(0,v.duration-.1));}}
        onLoadedData={()=>setBuffering(false)} onWaiting={()=>setBuffering(true)}
        onPlaying={()=>{setPlaying(true);setBuffering(false);setBlocked(false);setError('');}}
        onPause={()=>setPlaying(false)} onTimeUpdate={e=>{const current=e.currentTarget.currentTime;setTime(current);session[camera.id].time=current;}}
        onError={()=>{setBuffering(false);setPlaying(false);setError('현장 영상을 불러오지 못했습니다.');}}/>
      <div className="camera-top"><span><i/>{camera.label}</span><span className="recorded-badge">녹화 · 반복</span></div>
      {!error&&buffering&&<div className="cctv-video-message" role="status"><span className="cctv-loading-dot"/>영상 준비 중</div>}
      {error?<div className="cctv-video-message" role="status"><span>{error}</span><button onClick={()=>{setError('');setBuffering(true);video.current?.load();if(wanted)void video.current?.play().catch(()=>setBlocked(true));}}>다시 시도</button></div>:blocked&&<button className="cctv-start" onClick={togglePlayback}><Play size={17}/>눌러서 재생</button>}
    </div>
    <div className="cctv-transport">
      <div><button disabled={!!error} onClick={togglePlayback} aria-label={`${camera.label} ${playing?'일시정지':'재생'}`} title={playing?'일시정지':'재생'}>{playing?<Pause size={13}/>:<Play size={13}/>}</button><button onClick={()=>seek(0)} disabled={!duration} aria-label={`${camera.label} 처음부터`} title="처음부터"><RotateCcw size={12}/></button><time aria-label="녹화 재생 시간">{clock(time)} <span>/ {clock(duration)}</span></time><button className="cctv-volume" aria-label={`${camera.label} ${muted?'소리 켜기':'음소거'}`} title={muted?'소리 켜기':'음소거'} onClick={()=>{session[camera.id].muted=!muted;setMuted(!muted);}}>{muted?<VolumeX size={13}/>:<Volume2 size={13}/>}</button><button onClick={fullscreen} aria-label={`${camera.label} ${isFullscreen?'전체 화면 닫기':'전체 화면'}`} title={isFullscreen?'전체 화면 닫기':'전체 화면'}>{isFullscreen?<Minimize2 size={13}/>:<Maximize2 size={13}/>}</button></div>
      <input type="range" min={0} max={duration||1} step={.1} value={Math.min(time,duration||1)} disabled={!duration||!!error} onChange={e=>seek(Number(e.target.value))} aria-label={`${camera.label} 재생 위치`}/>
    </div>
    <div className="cctv-recording-caption"><span>{camera.view}</span><span>현장 녹화 영상</span></div>
    {fullscreenError&&<p className="cctv-fullscreen-error" role="status">{fullscreenError}</p>}
  </div>;
}

export function CctvMonitor(){
  const root=useRef<HTMLElement>(null),[source,setSource]=useState(session.source),[expanded,setExpanded]=useState(false);
  const enabled=useUI(s=>s.cctv),toggle=useUI(s=>s.toggle),panel=useUI(s=>s.panel),cinema=useUI(s=>s.cinema);
  const [pageVisible,setPageVisible]=useState(()=>!document.hidden&&matchMedia('(min-width: 761px)').matches);
  useEffect(()=>{
    const media=matchMedia('(min-width: 761px)');const update=()=>setPageVisible(!document.hidden&&media.matches);
    media.addEventListener('change',update);document.addEventListener('visibilitychange',update);update();
    return()=>{media.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  useEffect(()=>{
    const frame=root.current?.closest<HTMLElement>('.floating-feed'),app=root.current?.closest<HTMLElement>('.app');if(!frame||!app)return;
    const resize=()=>{if(!frame.classList.contains('cctv-expanded'))app.style.setProperty('--cctv-height',`${frame.getBoundingClientRect().height}px`);};
    const observer=new ResizeObserver(resize);observer.observe(frame);resize();
    return()=>{observer.disconnect();app.style.removeProperty('--cctv-height');};
  },[]);
  const visible=enabled&&pageVisible&&!cinema&&!['lab','people','analytics'].includes(panel);
  useEffect(()=>{if(!visible)setExpanded(false);},[visible]);
  useLayoutEffect(()=>{
    const frame=root.current?.closest('.floating-feed');frame?.classList.toggle('cctv-expanded',expanded);
    return()=>frame?.classList.remove('cctv-expanded');
  },[expanded]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setExpanded(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  const tabs=[{id:'virtual' as const,label:'가상 CCTV'},...recordings];
  const change=(value:Source)=>{session.source=value;setSource(value);};
  return <section ref={root} className="camera-section cctv-monitor"><div className="section-heading"><span><Camera size={14}/> {expanded?'CCTV 확대 모니터':'CCTV 모니터'}</span><div className="cctv-heading-actions">{enabled&&<button className="text-button" onClick={()=>setExpanded(v=>!v)} aria-label={expanded?'CCTV 작게 보기':'CCTV 크게 보기'} title={expanded?'작게 보기 (Esc)':'카메라 크게 보기'}>{expanded?<Minimize2 size={15}/>:<Expand size={15}/>}</button>}<button className="text-button" onClick={()=>toggle('cctv')} aria-label={enabled?'CCTV 숨기기':'CCTV 보기'}>{enabled?<Eye size={14}/>:<Camera size={14}/>}</button></div></div>
    {enabled?<><div className="cctv-source-tabs" role="tablist" aria-label="CCTV 영상 소스">{tabs.map((tab,i)=><button key={tab.id} id={`cctv-tab-${tab.id}`} role="tab" aria-selected={source===tab.id} aria-controls={`cctv-panel-${tab.id}`} tabIndex={source===tab.id?0:-1} onClick={()=>change(tab.id)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(i+1)%tabs.length:e.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;if(next>=0){e.preventDefault();change(tabs[next].id);document.getElementById(`cctv-tab-${tabs[next].id}`)?.focus();}}}>{tab.label}</button>)}</div>
      {source==='virtual'&&<div role="tabpanel" id="cctv-panel-virtual" aria-labelledby="cctv-tab-virtual"><VirtualFeed expanded={expanded}/></div>}
      {recordings.map(camera=><RecordingPlayer key={camera.id} camera={camera} selected={source===camera.id} visible={visible}/>)}</>:<button className="camera-off" onClick={()=>toggle('cctv')}>카메라 뷰 열기 <ArrowRight size={14}/></button>}
  </section>;
}
