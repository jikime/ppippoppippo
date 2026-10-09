import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowDownRight, ArrowUpRight, BrainCircuit, Check, ChevronRight, Download, FlaskConical, GitCompareArrows, Layers3, Play, ShieldCheck, Square } from 'lucide-react';
import { useLab } from './store';
import { FINDINGS, HAZARDS, MODEL_VERSION, RULES, hazardNames, rankFindings, regressionKeys } from './model';
import type { Finding, FindingKey, Hazard, Rule } from './model';
import type { ReviewResult } from './review';
import { downloadReport, report } from './report';
import { DetectionPanel } from './DetectionPanel';
import { PersonaTraits } from '../people/PeoplePanel';
import './lab.css';

const n=(v:number)=>v.toLocaleString('ko-KR');
const tabs=[['experiment','세계 실험'],['findings','취약점'],['manual','매뉴얼'],['detection','탐지·대응']] as const;
type Tab=typeof tabs[number][0];
function Delta({before,after}:{before:number;after:number}){
  return <span className={`lab-delta ${after>before?'worse':after<before?'better':''}`}>{after<before?<ArrowDownRight size={13}/>:after>before?<ArrowUpRight size={13}/>:null}{after===before?'변화 없음':`${n(Math.abs(after-before))}${after<before?' 감소':' 증가'}`}</span>;
}
export function LabPanel(){
  const lab=useLab(useShallow(({time:_,...rest})=>rest));
  const [tab,setTab]=useState<Tab>('experiment'),[activeFinding,setActiveFinding]=useState<FindingKey|null>(null);
  const [hazardFilter,setHazardFilter]=useState('all'),[onlyRegressions,setOnlyRegressions]=useState(false),[worldNumber,setWorldNumber]=useState('');
  const personCard=useRef<HTMLElement>(null);
  useEffect(()=>{if(lab.selected)personCard.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[lab.selected]);
  const regressed=useMemo(()=>lab.results.filter(r=>regressionKeys(r).length>0).length,[lab.results]);
  const findings=useMemo(()=>rankFindings(lab.results),[lab.results]);
  const ranked=useMemo(()=>tab!=='findings'?[]:lab.results.filter(r=>(hazardFilter==='all'||r.conditions.hazard===hazardFilter)&&(!onlyRegressions||regressionKeys(r).length>0)).sort((a,b)=>activeFinding?b.before[activeFinding]-a.before[activeFinding]||a.index-b.index:b.score-a.score||a.index-b.index).slice(0,24),[tab,lab.results,activeFinding,hazardFilter,onlyRegressions]);
  const complete=lab.results.length,requested=lab.run?.count??lab.config.count;
  const busy=lab.status==='running',current=lab.run&&JSON.stringify(lab.run)===JSON.stringify(lab.config);
  const replayPerson=lab.replay?.agents.find(a=>a.persona.id===lab.selected);
  return <>
    <div className="lab-tabs" role="tablist" aria-label="실험실 단계">{tabs.map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{label}{id==='findings'&&findings.length>0&&<b>{findings.length}</b>}</button>)}</div>
    <div className="lab-content">
      {tab==='experiment'&&<>
        <section className="lab-intro"><span className="eyebrow">COUNTERFACTUAL LAB</span><h3>하나의 행사장,<br/><em>수만 가지 가능성.</em></h3><p>서로 다른 사람과 사고 조건에서 대응의 빈틈을 찾고, 같은 세계로 개선안을 검증합니다.</p><div className="lab-agent-flow"><span>세계 생성</span><ChevronRight/><span>쌍 비교</span><ChevronRight/><span>근거 보고</span></div></section>
        <div className="lab-config"><label>실험할 세계 수<select aria-label="실험할 세계 수" disabled={busy} value={lab.config.count} onChange={e=>lab.configure({count:Number(e.target.value)})}>{[100,1000,5000,10000].map(v=><option key={v} value={v}>{n(v)}개 · {n(v*2)}회 비교 실행</option>)}</select></label><label>환경 변화<select aria-label="환경 변화" disabled={busy} value={lab.config.hazard} onChange={e=>lab.configure({hazard:e.target.value as Hazard|'mixed'})}><option value="mixed">4가지 상황 무작위 조합</option>{HAZARDS.map(h=><option key={h} value={h}>{hazardNames[h]}</option>)}</select></label><label>재현 시드<input aria-label="재현 시드" disabled={busy} type="number" min={0} max={4294967295} step={1} value={lab.config.seed} onChange={e=>lab.configure({seed:Number(e.target.value)})}/></label><label>관찰 시간<select aria-label="관찰 시간" disabled={busy} value={lab.config.horizon} onChange={e=>lab.configure({horizon:Number(e.target.value)})}>{[120,180,300].map(v=><option key={v} value={v}>{v}초 / 세계</option>)}</select></label></div>
        <div className="lab-population"><Layers3 size={16}/><span>합성 인물 120명<b>보행 · 반응 · 동반자 · 이동 지원 · 알레르기</b></span></div>
        <button className="lab-primary" onClick={busy?lab.cancel:lab.start}>{busy?<><Square size={13}/>실험 중지 · 완료 결과 보존</>:<><Play size={14} fill="currentColor"/>{complete?'새 실험 실행':'다중 세계 실험 시작'}<span>{n(lab.config.count)} WORLDS</span></>}</button>
        {lab.status!=='idle'&&<section className="lab-progress" aria-live="polite"><div><b>{busy?'세계 계산 중':lab.status==='completed'?'실험 완료':lab.status==='cancelled'?'실험 중지':'실험 중단'}</b><span>{n(complete)} / {n(requested)}</span></div><progress max={requested} value={complete}/><small>{n(complete*2)}회 계산 완료 · {lab.workers}개 작업자 · {(lab.elapsedMs/1000).toFixed(1)}초{lab.status==='cancelled'?` · 미수신 ${n(requested-complete)}개`:''}</small></section>}
        {lab.error&&<p className="lab-error" role="alert">{lab.error}</p>}
        {!!complete&&<button className="lab-outline" onClick={()=>setTab('findings')}>발견한 취약점 {findings.length}개 검토<ArrowUpRight size={14}/></button>}
        <details className="lab-details"><summary>실험 가정과 계산 범위</summary><p>현재 매뉴얼은 실제 문서를 입력하기 전의 시연용 가정입니다. 통로 그래프와 출구 처리량을 사용하는 사건·대기열 모형이며 기존 Recast 군중 물리와 다릅니다.</p><p>화재·정전은 출구 통과, 보안 위협은 담당 절차 수신 확인, 식사는 적합 배식을 완료 조건으로 사용합니다. 연기 확산·충돌·상해·사망을 계산하지 않습니다. 발견 빈도는 합성 표본 안의 비율입니다.</p><code>{MODEL_VERSION}</code></details>
      </>}
      {tab==='findings'&&<>
        <div className="lab-section-title"><div><span className="eyebrow">EVIDENCE FIRST</span><h3>우선 검토할 취약점</h3></div><span>{n(complete)}개 세계</span></div>
        {!complete?<Empty/>:<>
          <p className="lab-note">완료된 쌍만 집계합니다. 개선안에서 악화된 결과도 함께 표시합니다.</p>
          <div className="lab-findings">{findings.map((f,i)=><FindingCard key={f.key} finding={f} index={i} total={complete} active={activeFinding===f.key} onClick={()=>{setActiveFinding(f.key);lab.inspect(f.worldIndex,f.evidenceVariant);}}/>)}</div>
          <details className="lab-details"><summary>정렬 기준 확인</summary><p>심각도 가중치 40 + 현행·개선 중 최대 영향 인원 25 + 표본 내 최대 발견 빈도 20 + 재현 가능한 근거 15. 심각도는 계획용 설정값이며 검증된 위험 확률이 아닙니다. 출구 대기는 12명 초과분, 반응 지연은 60초 초과를 관찰 기준으로 삼습니다.</p></details>
          <ReviewAgent findings={findings}/>
          <div className="lab-section-title"><h4>{activeFinding?FINDINGS[activeFinding].title:'주요 세계'} 재생</h4>{activeFinding&&<button onClick={()=>setActiveFinding(null)}>전체 정렬</button>}</div>
          <div className="world-filters"><select aria-label="세계 상황 필터" value={hazardFilter} onChange={e=>setHazardFilter(e.target.value)}><option value="all">모든 상황</option>{HAZARDS.map(h=><option value={h} key={h}>{hazardNames[h]}</option>)}</select><label><input type="checkbox" checked={onlyRegressions} onChange={e=>setOnlyRegressions(e.target.checked)}/>개선 후 악화 {n(regressed)}개</label></div>
          <div className="world-jump"><input aria-label="재생할 세계 번호" type="number" min={1} max={requested} placeholder="세계 번호 직접 열기" value={worldNumber} onChange={e=>setWorldNumber(e.target.value)}/><button disabled={!lab.results.some(r=>r.index===Number(worldNumber)-1)} onClick={()=>lab.inspect(Number(worldNumber)-1)}>재생</button></div>
          <small className="lab-note">현재 조건의 상위 {ranked.length}개 세계 · 전체 결과는 JSON에 보존</small>
          <div className="world-grid">{ranked.map(r=><button key={r.index} className={lab.replay?.world.index===r.index?'selected':''} onClick={()=>lab.inspect(r.index)} aria-label={`세계 ${r.index+1} 재생`}><span>W{String(r.index+1).padStart(5,'0')}</span><b>{hazardNames[r.conditions.hazard]}</b><div className="world-bars">{r.before.exitLoads.map((load,i)=><i key={i} style={{height:`${Math.max(3,load/120*23)}px`}}/>)}</div><small>미완료 {r.before.unresolved} → {r.after.unresolved}</small></button>)}</div>
          {lab.run&&<button className="lab-outline" onClick={()=>downloadReport(report(lab.run!,lab.results,lab.status,lab.approval,lab.review))}><Download size={14}/>설정·모든 결과·근거 JSON 저장</button>}
        </>}
      </>}
      {tab==='manual'&&<>
        <div className="lab-section-title"><div><span className="eyebrow">MANUAL WORKBENCH</span><h3>근거로 고치는 대응 절차</h3></div><GitCompareArrows size={20}/></div>
        <p className="lab-note">현행과 개선안은 시연용 절차입니다. 항목을 바꾸고 같은 시드로 다시 실험하세요. 실제 운영 승인과 구분되는 훈련 승인입니다.</p>
        <div className="manual-table"><div className="manual-table-head"><span>절차 항목</span><span>현행</span><span>개선</span></div>{(Object.keys(RULES) as Rule[]).map(key=><div className="manual-rule" key={key}><div><b>{RULES[key].title}</b><p>{RULES[key].detail}</p></div>{(['baseline','candidate'] as const).map(variant=><input key={variant} type="checkbox" disabled={busy} aria-label={`${variant==='baseline'?'현행':'개선'} ${RULES[key].title}`} checked={lab.config[variant][key]} onChange={e=>lab.configure({[variant]:{...lab.config[variant],[key]:e.target.checked}})}/>)}</div>)}</div>
        {!!complete&&<><div className="lab-section-title"><h4>쌍 비교 결과</h4><small>세계별 중복을 포함한 합계</small></div><div className="manual-comparison">{findings.map(f=><div key={f.key}><span>{FINDINGS[f.key].title}</span><strong>{n(f.total)} → {n(f.afterTotal)}</strong><Delta before={f.total} after={f.afterTotal}/>{f.regressedWorlds>0&&<small className="lab-regression">{n(f.regressedWorlds)}개 세계 악화</small>}</div>)}</div></>}
        {!current&&complete>0&&<p className="lab-error">현재 설정은 표시된 실험과 다릅니다. 변경한 매뉴얼로 다시 실험해야 승인할 수 있습니다.</p>}
        <button className="lab-primary" disabled={busy} onClick={()=>{setTab('experiment');lab.start();}}><FlaskConical size={14}/>이 매뉴얼로 쌍 비교 실행</button>
        <button className="lab-outline" disabled={!current||lab.status!=='completed'||!!lab.approval} onClick={lab.approve}>{lab.approval?<><Check size={15}/>훈련 매뉴얼 승인됨</>:<><ShieldCheck size={15}/>비교한 개선안을 훈련 매뉴얼로 승인</>}</button>
        {lab.approval&&<div className="lab-callout success"><Check size={16}/><p>{n(lab.approval.count)}개 쌍 비교에 연결된 승인입니다. 탐지·대응에서 모의 작업을 생성할 수 있습니다. 실제 알림·설비 제어 권한은 부여하지 않습니다.</p></div>}
        {regressed>0&&<p className="lab-error">개선 후 {n(regressed)}개 세계에서 하나 이상 지표가 증가했습니다. 해당 세계를 재생하고 원인을 검토해 주세요.</p>}
      </>}
      {tab==='detection'&&<DetectionPanel/>}
      {replayPerson&&<section className="replay-person" ref={personCard}><div className="lab-section-title"><h4>{replayPerson.persona.name} · {replayPerson.persona.id}</h4><button onClick={()=>useLab.setState({selected:null})}>닫기</button></div><p>{replayPerson.persona.team} · {replayPerson.persona.job}</p><PersonaTraits profile={replayPerson.persona}/><dl className="person-facts"><div><dt>대응 시작</dt><dd>+{replayPerson.depart.toFixed(1)}초</dd></div><div><dt>배정 출입구</dt><dd>{replayPerson.exit===null?'해당 없음':['A','B','C'][replayPerson.exit]}</dd></div><div><dt>모형 내 경로 위험</dt><dd>{replayPerson.risky?'위험 구역과 교차':'교차 없음'}</dd></div><div><dt>완료 시각</dt><dd>{Number.isFinite(replayPerson.finish)?`+${replayPerson.finish.toFixed(1)}초`:'완료 조건 미충족'}</dd></div></dl></section>}
    </div>
  </>;
}
function Empty(){return <div className="lab-empty"><FlaskConical size={28}/><strong>실험 근거를 기다리고 있습니다.</strong><p>세계 실험에서 실행하면 취약점과 비교 결과가 여기에 모입니다.</p></div>;}
function FindingCard({finding:f,index,total,active,onClick}:{finding:Finding;index:number;total:number;active:boolean;onClick:()=>void}){
  const definition=FINDINGS[f.key];
  return <button className={`finding-card ${active?'active':''}`} onClick={onClick}><div className="finding-top"><span>{String(index+1).padStart(2,'0')} · 검토 지수</span><b>{f.score}<small>/100</small></b></div><h4>{definition.title}</h4><p>{definition.meaning}</p><div className="finding-frequency"><i style={{width:`${f.worlds/Math.max(1,total)*100}%`}}/></div><div className="finding-numbers"><span>현행 {n(f.worlds)} / 개선 {n(f.afterWorlds)}개 세계 · 최대 {f.peak}{definition.unit}</span><ChevronRight size={14}/></div><footer><span>누적 {n(f.total)} → {n(f.afterTotal)}</span><Delta before={f.total} after={f.afterTotal}/></footer>{f.regressedWorlds>0&&<span className="lab-regression">개선 후 {n(f.regressedWorlds)}개 세계에서 증가 · 개별 검토 필요</span>}</button>;
}
function ReviewAgent({findings}:{findings:Finding[]}){
  const run=useLab(s=>s.run),completed=useLab(s=>s.results.length),status=useLab(s=>s.status);
  const result=useLab(s=>s.review);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{setBusy(false);setError('');return()=>controller.current?.abort();},[run]);
  const evaluate=async()=>{
    if(!run)return;controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setError('');
    try{const response=await fetch('/api/decisions/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({completed,seed:run.seed,findings}),signal:abort.signal});const value=await response.json();if(!response.ok)throw new Error(value.error||'검토 실패');if(!abort.signal.aborted)useLab.setState({review:value as ReviewResult});}
    catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'검토 실패');}finally{if(!abort.signal.aborted)setBusy(false);}
  };
  return <section className="lab-review"><div><BrainCircuit size={17}/><b>OpenAI · 근거 검토</b><span>Decisions</span></div><p>실제 계산된 취약점과 전후 비교를 바탕으로 먼저 검토할 절차를 선택합니다.</p><button className="lab-outline" disabled={busy||status==='running'||!findings.length} onClick={()=>void evaluate()}>{busy?'실험 근거 검토 중…':'검토 우선순위 판단'}</button>{error&&<p className="lab-error" role="status">{error}</p>}{result&&<div className="review-result"><strong>{result.rule==='investigate'?'추가 실험·근거 확인':RULES[result.rule].title}</strong><small>선택 확신도 {Math.round(result.confidence*100)}% · {result.model} · {result.elapsedMs}ms</small><p>검토 제안입니다. 승인이나 현장 조치를 실행하지 않습니다.</p></div>}</section>;
}
export function LabStats(){
  const results=useLab(s=>s.results),run=useLab(s=>s.run);
  const regressed=useMemo(()=>results.filter(r=>regressionKeys(r).length>0).length,[results]);
  const findings=useMemo(()=>rankFindings(results),[results]);
  return <div className="stats-row lab-stats">{[
    ['실행 완료 세계',n(results.length),`요청 ${n(run?.count??0)}개 · 현행/개선 쌍`],
    ['확인할 취약점',String(findings.length),'재현 가능한 시드·지표 연결'],
    ['완료한 계산',n(results.length*2),'기록된 실행만 집계'],
    ['개선 후 재검토',n(regressed),'하나 이상 관찰 지표 증가'],
  ].map(([label,value,note])=><div className="stat-card" key={label}><div className="stat-top">{label}<Layers3 size={14}/></div><div className="stat-value">{value}</div><div className="stat-foot">{note}</div></div>)}</div>;
}
