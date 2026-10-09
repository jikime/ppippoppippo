import { Layers3, Pause, Play, RotateCcw } from 'lucide-react';
import { useLab } from './store';
import { hazardNames } from './model';

export function LabHUD(){
  const replay=useLab(s=>s.replay),playing=useLab(s=>s.playing),time=useLab(s=>Math.floor(s.time)),speed=useLab(s=>s.speed);
  if(!replay)return <div className="lab-scene-title"><span><Layers3 size={13}/> MULTIVERSE / AWS SEOUL</span><h1>위기를 먼저 경험하고,<br/>대응을 더 정교하게.</h1><p>실험할 세계를 생성하면 이 공간에서 결과를 재생합니다.</p></div>;
  const result=replay.world,metrics=result[replay.variant];
  const event=replay.events.filter(e=>e.time<=time).at(-1);
  return <><div className="lab-scene-title"><span><Layers3 size={13}/> WORLD {String(result.index+1).padStart(5,'0')}</span><h1>{hazardNames[result.conditions.hazard]}</h1><p>SEED {result.conditions.seed} · 사건·대기열 모형 재생</p><div className="lab-version-switch">{(['before','after'] as const).map(v=><button key={v} className={replay.variant===v?'selected':''} onClick={()=>useLab.getState().switchVariant(v)}>{v==='before'?'현행 매뉴얼':'개선 매뉴얼'}</button>)}</div><div className="replay-metrics"><span>종료 시 미완료 <b>{metrics.unresolved}명</b></span><span>위험 구역 경로 <b>{metrics.riskyRoutes}명</b></span><span>최대 출구 대기 <b>{metrics.maxQueue}명</b></span>{metrics.exitLoads.some(n=>n>0)&&<div className="replay-exits"><small>출구별 배정 인원</small><div>{metrics.exitLoads.map((count,i)=><span key={i}><small>{['A','B','C'][i]}</small><b>{count}</b><i style={{width:`${count/120*100}%`}}/></span>)}</div></div>}</div></div>
    <section className="replay-dock" aria-label="실험 세계 재생"><div className="replay-heading"><div><span className="eyebrow">RECORDED WORLD · REPRODUCIBLE SEED</span><h2>같은 사람, 같은 조건. 달라진 대응.</h2></div><div className="replay-transport"><button aria-label={playing?'실험 재생 정지':'실험 재생 시작'} onClick={()=>useLab.setState(s=>({playing:!s.playing,time:s.time>=replay.horizon?0:s.time}))}>{playing?<Pause size={15}/>:<Play size={15}/>}</button><button aria-label="실험 처음부터 재생" onClick={()=>{useLab.getState().seek(0);useLab.setState({playing:true});}}><RotateCcw size={14}/></button>{[1,4,16].map(s=><button className={speed===s?'selected':''} key={s} onClick={()=>useLab.setState({speed:s})}>×{s}</button>)}</div></div><div className="replay-scrub"><span>+{time}s</span><input type="range" aria-label="실험 재생 시각" min={0} max={replay.horizon} value={time} onChange={e=>useLab.getState().seek(Number(e.target.value))}/><span>{replay.horizon}s</span></div><div className="replay-event"><i/><b>{event?.title}</b><span>{event?.detail}</span></div></section>
  </>;
}
