import { memo,useDeferredValue,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import type { ReactNode } from 'react';
import { Area,AreaChart,Bar,BarChart,CartesianGrid,Legend,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis } from 'recharts';
import { Activity,ArrowUpRight,BarChart3,Box,FlaskConical,Grid2X2,Layers3,Maximize2,Pause,Play,Users } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useUI } from '../state';
import { world } from '../simulation/world';
import { EXITS,ROOM,TABLES,roleNames,stateNames } from '../simulation/layout';
import { eventTime,phaseAt } from '../simulation/agenda';
import { useLab } from '../lab/store';
import { FINDINGS,HAZARDS,hazardNames,regressionKeys } from '../lab/model';
import type { Hazard } from '../lab/model';
import { downloadReport,report } from '../lab/report';
import { experimentSummary,shortFindingNames } from './data';
import type { DensityCell } from './data';
import { useTelemetry } from './telemetry';
import './analytics.css';

const C={lime:'#a2db58',cyan:'#63ccd6',amber:'#efb46c',violet:'#a6a1df',muted:'#90a6b9',grid:'#293b4d',red:'#eb8b82'};
const axis={tick:{fill:C.muted,fontSize:10},axisLine:false as const,tickLine:false as const};
const tooltip={backgroundColor:'#14273b',border:'1px solid #40586e',borderRadius:6,color:'#f0f6fc',fontSize:11,padding:'10px 14px'};
const legend={fontSize:11,paddingTop:12,color:C.muted};
const seconds=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const number=(n:number)=>n.toLocaleString('ko-KR');

function Card({id,kicker,title,note,children,className=''}:{id?:string;kicker:string;title:string;note?:string;children:ReactNode;className?:string}){
  return <section id={id} className={`analytics-card ${className}`} aria-label={title}><header><div><span className="analytics-kicker">{kicker}</span><h2>{title}</h2></div></header>{children}{note&&<p className="chart-note">{note}</p>}</section>;
}
function Empty({children}:{children:ReactNode}){return <div className="chart-empty"><BarChart3 size={25}/><p>{children}</p></div>;}
function DensityMap({density,people,animate}:{density:ReturnType<typeof useTelemetry>['density'];people:ReturnType<typeof useTelemetry>['people'];animate:boolean}){
  const [selected,setSelected]=useState<number|null>(null);
  const cell=selected===null?null:density.cells[selected];
  const color=(n:number)=>n===0?'#182b3a':n<.5?'#254947':n<1?'#4b8270':n<1.5?'#a2ca7c':n<2?'#e6c276':'#ee9771';
  const pick=(c:DensityCell)=>setSelected(c.row*density.cols+c.col);
  return <><div className={`density-map ${animate?'animated':''}`}>
    <svg viewBox="-15.7 -8.2 31.4 17" aria-label={`행사장 바닥 ${density.area}제곱미터의 인구밀도. 지도 안 ${density.counted}명, 평균 ${density.average.toFixed(2)}명/제곱미터.`}>
      <text x="0" y="-7.55" textAnchor="middle" className="density-axis">프레젠테이션 월 · 29 m</text>
      {density.cells.map((c,i)=><rect key={i} x={c.x+.03} y={c.z+.03} width={c.width-.06} height={c.depth-.06} rx=".07" fill={color(c.density)} stroke={selected===i?'#f7f9ff':'none'} strokeWidth=".065" role="button" tabIndex={c.count?0:-1} aria-label={`${c.col+1}열 ${c.row+1}행: ${c.count}명, ${c.density.toFixed(2)}명/㎡`} onClick={()=>pick(c)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(c);}}}><title>{`${c.count}명 / ${c.area}㎡ = ${c.density.toFixed(2)}명/㎡`}</title></rect>)}
      {TABLES.map(t=><rect key={t.id} x={t.x-1.25} y={t.z-.4} width="2.5" height=".8" fill="#10232c" fillOpacity=".48" stroke="#bdd8d4" strokeOpacity=".3" strokeWidth=".04" pointerEvents="none"/>)}
      {people.filter(p=>!['outside','notArrived'].includes(p.state)&&Math.abs(p.position.x)<=ROOM.width/2&&Math.abs(p.position.z)<=ROOM.depth/2).map(p=><circle key={p.id} cx={p.position.x} cy={p.position.z} r=".075" fill="#e9fbf3" pointerEvents="none"/>)}
      {EXITS.map(e=><g key={e.id}><rect x={e.x-.8} y={7.08} width="1.6" height=".18" fill={C.lime}/><text x={e.x} y={7.95} textAnchor="middle" className="density-exit">EXIT {e.id}</text></g>)}
    </svg>
  </div><div className="density-legend"><span>인구밀도 <b>명/㎡</b></span><div>{[0,.25,.5,1,1.5,2].map(v=><span key={v}><i style={{background:color(v)}}/>{v===2?'2+':v===.25?'0–0.5':v}</span>)}</div></div>
  <div className="density-selection">{cell?<><span><b>{cell.col+1}열 · {cell.row+1}행</b> {cell.count}명 / {cell.area}㎡ · {cell.density.toFixed(2)}명/㎡</span><div>{cell.ids.map(id=><button key={id} onClick={()=>{useUI.getState().select(id);document.querySelector('.analytics-person')?.scrollIntoView({behavior:animate?'smooth':'instant',block:'center'});}}>{people.find(p=>p.id===id)?.profile.name??id}<ArrowUpRight size={11}/></button>)}{!cell.count&&<small>현재 인물이 없는 격자입니다.</small>}</div></>:<span>격자를 선택하면 해당 위치의 인물을 확인할 수 있습니다.</span>}</div>
  </>;
}

function PersonCard({people}:{people:ReturnType<typeof useTelemetry>['people']}){
  const id=useUI(s=>s.selected),p=people.find(p=>p.id===id)??people[0];
  if(!p)return <Card kicker="PERSON MONITOR" title="인물 모니터링"><Empty>인물을 불러오는 중입니다.</Empty></Card>;
  return <Card kicker="PERSON MONITOR" title="선택한 합성 참가자" className="analytics-person">
    <select aria-label="분석 대시보드 인물 선택" value={p.id} onChange={e=>useUI.getState().select(e.target.value)}>{people.map(p=><option value={p.id} key={p.id}>{p.profile.name} · {p.id}</option>)}</select>
    <div className="analytics-person-name"><div className="analytics-avatar"><Users size={24}/></div><div><small>{p.id} · {p.profile.team}</small><h3>{p.profile.name}</h3><span>{p.profile.job}</span></div></div>
    <div className="analytics-person-state"><i/>{stateNames[p.state]}<small>{roleNames[p.role]}</small></div>
    <dl><div><dt>현재 목적지</dt><dd>{p.goalName}</dd></div><div><dt>현재 이동 속도</dt><dd>{p.speed.toFixed(2)} <small>m/s</small></dd></div><div><dt>이동 지원 가정</dt><dd>{p.profile.needsAssistance?'담당자 배정 필요':'독립 이동'}</dd></div></dl>
    <p className="analytics-person-objective">{p.profile.objective}</p>
    <button className="analytics-button" onClick={()=>useUI.setState({panel:'people',selected:p.id,panelVisible:true,mobilePanel:true,cinema:false})}>상태 이력·관찰 메모<ArrowUpRight size={14}/></button>
    <small className="analytics-person-disclaimer">실제 참석자와 무관한 합성 페르소나입니다.</small>
  </Card>;
}

const LiveCharts=memo(function LiveCharts({data,animate}:{data:ReturnType<typeof useTelemetry>;animate:boolean}){
  const {snapshot:d,people,density}=data;
  const activity=d.activities.filter(a=>a.state!=='outside'&&a.state!=='notArrived').map(a=>({name:stateNames[a.state],value:a.count,fill:[C.lime,C.cyan,C.violet,C.amber,C.red,'#5f88ba','#c4d4d8'][Object.keys(stateNames).indexOf(a.state)%7]}));
  const roles=Object.entries(roleNames).map(([role,name])=>({name,count:people.filter(p=>p.role===role&&!['outside','notArrived'].includes(p.state)).length}));
  const exits=d.exits.map(e=>({...e,name:`출구 ${e.id}${e.open?'':' · 통제'}`}));
  return <div className="analytics-grid">
    <Card kicker="SPATIAL DENSITY" title="공간별 인구밀도" className="analytics-wide" note={`2m 격자 · 바닥 ${density.area}㎡ 가정, 가구 면적 포함. 색상은 밀도 구간이며 안전 등급이 아닙니다.${density.outsideFootprint?` 지도 바깥 이동 인원 ${density.outsideFootprint}명은 밀도에서 제외합니다.`:''}`}>
      <DensityMap density={density} people={people} animate={animate}/>
    </Card>
    <Card kicker="ACTIVITY MIX" title="현재 활동 분포" note={`현재 체류 ${d.inside}명 기준 · 퇴장 ${d.outside}명 · 입장 예정 ${d.expected}명 제외`}>
      {activity.length?<><div className="chart-stage donut-stage"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:320,height:250}}><PieChart accessibilityLayer><Pie data={activity} dataKey="value" nameKey="name" innerRadius="59%" outerRadius="83%" paddingAngle={2} stroke="none" isAnimationActive={animate} animationDuration={600}/><Tooltip contentStyle={tooltip} itemStyle={{color:'#edf5fc'}} formatter={v=>[`${v}명`,'인원']}/></PieChart></ResponsiveContainer><div className="donut-center"><b>{d.inside}</b><span>현재 체류 · 명</span></div></div><div className="activity-key">{activity.map(a=><div key={a.name}><i style={{background:a.fill}}/><span>{a.name}</span><b>{a.value}<small>명</small></b></div>)}</div><div className="analytics-roles"><h3>역할별 구성</h3>{roles.map((r,i)=><div key={r.name}><span>{r.name}</span><div><i style={{width:`${r.count/Math.max(1,d.inside)*100}%`,background:[C.cyan,C.lime,C.amber,C.violet][i]}}/></div><b>{r.count}<small>명</small></b></div>)}</div></>:<Empty>현재 체류 인원이 없습니다.</Empty>}
    </Card>
    <Card kicker="FLOW OVER TIME" title="이동과 대기의 흐름" className="analytics-wide" note="최근 90개 시뮬레이션 초 표본 · 이동·대기는 체류 인원에 포함됩니다. 일시정지하면 기록도 멈춥니다.">
      {d.history.length>1?<div className="chart-stage"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:700,height:270}}><AreaChart data={d.history} margin={{top:12,right:18,left:-13,bottom:0}} accessibilityLayer>
        <defs><linearGradient id="flow-cyan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.cyan} stopOpacity={.3}/><stop offset="100%" stopColor={C.cyan} stopOpacity={0}/></linearGradient></defs>
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 5"/><XAxis {...axis} dataKey="time" type="number" domain={['dataMin','dataMax']} tickFormatter={seconds} minTickGap={35}/><YAxis {...axis} allowDecimals={false}/><Tooltip contentStyle={tooltip} labelFormatter={v=>`장면 경과 ${seconds(Number(v))}`} formatter={(v,n)=>[`${v}명`,n]}/><Legend wrapperStyle={legend}/>
        <Area type="linear" dataKey="inside" name="체류 인원" stroke={C.violet} strokeWidth={1.5} fill="transparent" isAnimationActive={animate} animationDuration={400}/><Area type="linear" dataKey="moving" name="이동 중" stroke={C.cyan} strokeWidth={2} fill="url(#flow-cyan)" isAnimationActive={animate} animationDuration={400}/><Area type="linear" dataKey="waiting" name="출구 대기" stroke={C.amber} strokeWidth={2} fill={C.amber} fillOpacity={.08} isAnimationActive={animate} animationDuration={400}/>
      </AreaChart></ResponsiveContainer></div>:<Empty>재생하면 이동·대기 기록이 쌓입니다. 아직 추이를 그릴 표본이 부족합니다.</Empty>}
    </Card>
    <Card kicker="EXIT BALANCE" title="출입구별 이동 현황" note="현재 배정에는 대기 인원이 포함됩니다. 퇴장은 누적값이며 세 수치를 합산하지 않습니다.">
      <div className="chart-stage"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:340,height:270}}><BarChart data={exits} margin={{top:12,right:8,left:-20,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 5"/><XAxis {...axis} dataKey="name"/><YAxis {...axis} allowDecimals={false}/><Tooltip contentStyle={tooltip} cursor={{fill:'#ffffff07'}} formatter={(v,n)=>[`${v}명`,n]}/><Legend wrapperStyle={legend}/><Bar dataKey="assigned" name="현재 배정" fill={C.cyan} radius={[3,3,0,0]} isAnimationActive={animate} animationDuration={550}/><Bar dataKey="queue" name="현재 대기" fill={C.amber} radius={[3,3,0,0]} isAnimationActive={animate} animationDuration={550}/><Bar dataKey="departed" name="누적 퇴장" fill={C.lime} radius={[3,3,0,0]} isAnimationActive={animate} animationDuration={550}/></BarChart></ResponsiveContainer></div>
      <div className="exit-status-key">{d.exits.map(e=><span key={e.id}><i style={{background:e.open?C.lime:C.red}}/>{e.id} {e.open?'개방':'통제'}</span>)}</div>
    </Card>
  </div>;
});

const ExperimentCharts=memo(function ExperimentCharts({animate}:{animate:boolean}){
  const lab=useLab(useShallow(s=>({results:s.results,status:s.status,run:s.run,config:s.config,approval:s.approval,review:s.review,error:s.error})));
  const results=useDeferredValue(lab.results);
  const [hazard,setHazard]=useState<Hazard|'all'>('all');
  const summary=useMemo(()=>experimentSummary(results,hazard),[results,hazard]);
  const replay=(index:number)=>{useLab.getState().inspect(index,'after');useUI.setState({panel:'lab',panelVisible:true,mobilePanel:true,cinema:false});};
  const outcomes=[{name:'악화 지표 있음',value:summary.regressed,fill:C.red},{name:'악화 없이 개선',value:summary.improved,fill:C.lime},{name:'동일',value:summary.unchanged,fill:C.muted}].filter(s=>s.value);
  return <section className="experiment-analytics" id="experiment-analytics" aria-label="다중 세계 실험 분석">
    <div className="analytics-section-heading"><div><span className="analytics-kicker">MULTIVERSE EVIDENCE</span><h2>다른 세계에서 발견한 취약점</h2><p>같은 인물과 환경에 두 매뉴얼을 적용한 비교입니다.</p></div><div className="analytics-actions"><select aria-label="분석 시나리오 필터" value={hazard} onChange={e=>setHazard(e.target.value as Hazard|'all')}><option value="all">모든 시나리오</option>{HAZARDS.map(h=><option key={h} value={h}>{hazardNames[h]}</option>)}</select><button className="analytics-button" onClick={()=>useUI.setState({panel:'lab',panelVisible:true,mobilePanel:true})}><FlaskConical size={14}/>실험실 열기</button></div></div>
    <div className="analytics-run-status"><span className={`analytics-signal ${lab.status==='running'?'':'stopped'}`}><i/>{({idle:'실험 전',running:'계산 중',completed:'계산 완료',cancelled:'취소 · 부분 결과',error:'중단 · 부분 결과'})[lab.status]}</span><span>{number(lab.results.length)} / {number(lab.run?.count??lab.config.count)}개 세계</span>{lab.run&&<span>SEED {lab.run.seed} · 관찰 {lab.run.horizon}초</span>}{results!==lab.results&&<span>차트 갱신 중</span>}</div>
    {lab.error&&<p className="analytics-error" role="alert">{lab.error}</p>}
    {!results.length?<div className="analytics-experiment-empty"><div className="experiment-orbits"><FlaskConical size={27}/></div><h3>아직 비교할 세계가 없습니다.</h3><p>화재, 정전, 보안 위협, 식사 상황을 반복 실행하면<br/>취약점과 매뉴얼 변경 효과가 이곳에 나타납니다.</p><button className="analytics-button primary" disabled={lab.status==='running'} onClick={()=>useLab.getState().start()}>{lab.status==='running'?'세계 계산 중…':`${number(lab.config.count)}개 세계 실행`}<ArrowUpRight size={15}/></button></div>:<>
      <div className="experiment-numbers"><div><small>선택한 시나리오의 세계</small><b>{number(summary.selected.length)}<em>개</em></b></div><div><small>전후 비교 계산</small><b>{number(summary.selected.length*2)}<em>회</em></b></div><div className={summary.regressed?'has-regressions':''}><small>하나라도 악화된 세계</small><b>{number(summary.regressed)}<em>개</em></b></div><div><small>악화 없이 개선된 세계</small><b>{number(summary.improved)}<em>개</em></b></div></div>
      {!summary.selected.length?<Empty>선택한 시나리오의 결과가 없습니다. 다른 시나리오를 선택하세요.</Empty>:<>
        <div className="analytics-grid">
          <Card kicker="MANUAL COMPARISON" title="취약점이 나타난 세계 수" className="analytics-wide" note="인원 합계가 아닌 해당 취약점이 한 번 이상 나타난 세계 수입니다. 하나의 세계가 여러 항목에 포함될 수 있습니다.">
            <div className="chart-stage findings-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:700,height:310}}><BarChart layout="vertical" data={summary.findings} margin={{top:8,right:22,left:0,bottom:0}} accessibilityLayer><CartesianGrid horizontal={false} stroke={C.grid} strokeDasharray="3 5"/><XAxis {...axis} type="number" allowDecimals={false}/><YAxis {...axis} type="category" dataKey="name" width={110}/><Tooltip contentStyle={tooltip} cursor={{fill:'#ffffff07'}} formatter={(v,n)=>[`${number(Number(v))}개 세계`,n]}/><Legend wrapperStyle={legend}/><Bar dataKey="before" name="기존 매뉴얼" fill={C.violet} radius={[0,3,3,0]} isAnimationActive={animate} animationDuration={700}/><Bar dataKey="after" name="후보 매뉴얼" fill={C.lime} radius={[0,3,3,0]} isAnimationActive={animate} animationDuration={700}/></BarChart></ResponsiveContainer></div>
          </Card>
          <Card kicker="PAIRED OUTCOMES" title="세계별 개선과 악화" note="7개 취약점 지표 중 하나라도 악화되면 악화에 포함합니다. 임의 생성 조건의 결과이며 실제 사고 확률은 아닙니다.">
            <div className="chart-stage donut-stage"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:320,height:250}}><PieChart accessibilityLayer><Pie data={outcomes} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="83%" stroke="none" paddingAngle={2} isAnimationActive={animate} animationDuration={750}/><Tooltip contentStyle={tooltip} itemStyle={{color:'#edf5fc'}} formatter={v=>[`${number(Number(v))}개 세계`,'분류']}/></PieChart></ResponsiveContainer><div className="donut-center"><b className="coral">{(summary.regressed/summary.selected.length*100).toFixed(1)}<small>%</small></b><span>악화 지표가 있는 세계</span></div></div><div className="activity-key">{outcomes.map(s=><div key={s.name}><i style={{background:s.fill}}/><span>{s.name}</span><b>{number(s.value)}</b></div>)}</div>
          </Card>
          <Card kicker="QUEUE DISTRIBUTION" title="최대 출구 대기 인원 분포" className="analytics-wide" note={`화재·정전 ${number(summary.evacuation.length)}개 세계만 집계 · 가로축은 세계별 최대 대기 인원 구간, 세로축은 세계 수입니다.`}>
            {summary.evacuation.length?<div className="chart-stage"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:700,height:270}}><BarChart data={summary.histogram} margin={{top:12,right:18,left:-10,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 5"/><XAxis {...axis} dataKey="name" minTickGap={5}/><YAxis {...axis} allowDecimals={false}/><Tooltip contentStyle={tooltip} cursor={{fill:'#ffffff07'}} labelFormatter={v=>`최대 대기 ${v}명`} formatter={(v,n)=>[`${number(Number(v))}개 세계`,n]}/><Legend wrapperStyle={legend}/><Bar dataKey="before" name="기존 매뉴얼" fill={C.violet} radius={[3,3,0,0]} isAnimationActive={animate} animationDuration={700}/><Bar dataKey="after" name="후보 매뉴얼" fill={C.lime} radius={[3,3,0,0]} isAnimationActive={animate} animationDuration={700}/></BarChart></ResponsiveContainer></div>:<Empty>이 그래프는 화재·정전의 대피 결과만 비교합니다.</Empty>}
          </Card>
          <Card kicker="ROUTE DISTRIBUTION" title="출구 배정의 변화" note={`화재·정전 ${number(summary.evacuation.length)}개 세계의 평균 배정 인원입니다. 출구 통제나 경로 미배정으로 합계가 120보다 작을 수 있습니다.`}>
            {summary.evacuation.length?<div className="chart-stage"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{width:340,height:270}}><BarChart data={summary.exitLoads} margin={{top:12,right:8,left:-20,bottom:0}} accessibilityLayer><CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 5"/><XAxis {...axis} dataKey="name" tickFormatter={v=>`출구 ${v}`}/><YAxis {...axis}/><Tooltip contentStyle={tooltip} cursor={{fill:'#ffffff07'}} formatter={(v,n)=>[`${Number(v).toFixed(1)}명 / 세계`,n]}/><Legend wrapperStyle={legend}/><Bar dataKey="before" name="기존 매뉴얼" fill={C.violet} radius={[3,3,0,0]} isAnimationActive={animate} animationDuration={700}/><Bar dataKey="after" name="후보 매뉴얼" fill={C.lime} radius={[3,3,0,0]} isAnimationActive={animate} animationDuration={700}/></BarChart></ResponsiveContainer></div>:<Empty>대피 시나리오를 선택하면 출구 배정을 비교할 수 있습니다.</Empty>}
          </Card>
        </div>
        <div className="analytics-evidence"><div><span className="analytics-kicker">REVIEW THE EXCEPTIONS</span><h3>다시 살펴볼 세계</h3><p>악화가 있는 세계 중 검토 점수가 높은 6개입니다. 선택하면 후보 매뉴얼의 3D 재생을 엽니다.</p></div><div className="analytics-worlds">{summary.examples.map(r=><button key={r.index} onClick={()=>replay(r.index)}><span><small>WORLD</small><b>#{number(r.index+1)}</b></span><div><strong>{hazardNames[r.conditions.hazard]}</strong><small>{regressionKeys(r).map(k=>shortFindingNames[k]).join(' · ')}</small></div><ArrowUpRight size={16}/></button>)}{!summary.examples.length&&<p>선택한 결과에서 악화된 취약점 지표가 없습니다.</p>}</div></div>
        <details className="analytics-data-table"><summary>취약점별 수치 표로 보기</summary><div><table><caption>선택한 시나리오 {number(summary.selected.length)}개 세계의 전후 비교</caption><thead><tr><th scope="col">취약점</th><th scope="col">기존 발생 세계</th><th scope="col">후보 발생 세계</th><th scope="col">악화 세계</th></tr></thead><tbody>{summary.findings.map(f=><tr key={f.key}><th scope="row" title={FINDINGS[f.key].meaning}>{f.name}</th><td>{number(f.before)}</td><td>{number(f.after)}</td><td>{number(f.regressed)}</td></tr>)}</tbody></table></div></details>
      </>}
      <div className="analytics-report"><span>변경 전후의 계산값과 가정을 함께 검토하세요.</span><button className="analytics-button" disabled={!lab.run} onClick={()=>lab.run&&downloadReport(report(lab.run,lab.results,lab.status,lab.approval,lab.review))}>전체 실험 근거 다운로드<ArrowUpRight size={14}/></button></div>
    </>}
  </section>;
});

export default function AnalyticsDashboard(){
  const sceneSlot=useRef<HTMLDivElement>(null);
  const data=useTelemetry(),{snapshot:d,density}=data;
  const [enabled,setEnabled]=useState(true),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  const camera=useUI(s=>s.camera),heatmap=useUI(s=>s.heatmap);
  // Keep the WebGL canvas and Drei HTML roots mounted across navigation. Only
  // its frame changes; replacing the Canvas races with HTML portal cleanup.
  useLayoutEffect(()=>{
    const slot=sceneSlot.current,host=document.querySelector<HTMLElement>('.scene-host'),root=document.querySelector<HTMLElement>('.workspace');
    if(!slot||!host||!root)return;
    const place=()=>{
      const box=slot.getBoundingClientRect(),parent=root.getBoundingClientRect();
      Object.assign(host.style,{left:`${box.left-parent.left+root.scrollLeft}px`,top:`${box.top-parent.top+root.scrollTop}px`,width:`${box.width}px`,height:`${box.height}px`,right:'auto',bottom:'auto'});
      host.dataset.embedded='true';
    };
    const observer=new ResizeObserver(place);observer.observe(slot);observer.observe(slot.closest('.analytics-dashboard')!);window.addEventListener('resize',place);place();
    return()=>{observer.disconnect();window.removeEventListener('resize',place);host.removeAttribute('style');delete host.dataset.embedded;};
  },[]);
  useEffect(()=>{useUI.getState().setCamera('overview');},[]);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const animate=enabled&&!reduced;
  const openLive=()=>useUI.setState({panel:'overview',panelVisible:true,mobilePanel:false,cinema:false});
  return <div className="analytics-dashboard" data-animated={animate} data-sample-time={d.time} data-sample-revision={d.revision}>
    <div className="analytics-title"><div><span className="analytics-kicker"><Activity size={12}/> VENUE INTELLIGENCE</span><h1>숫자로 읽는 공간의 흐름<span>분석 대시보드</span></h1><p>사람의 움직임에서, 다음 대응의 근거까지.</p></div><div className="analytics-actions"><label className="analytics-motion"><input type="checkbox" checked={animate} disabled={reduced} onChange={e=>setEnabled(e.target.checked)}/>{reduced?'모션 최소화 설정 적용':'차트 애니메이션'}</label><button className="analytics-button" onClick={()=>document.getElementById('experiment-analytics')?.scrollIntoView({behavior:animate?'smooth':'instant',block:'start'})}>세계 실험 분석<ArrowUpRight size={14}/></button></div></div>
    <div className="analytics-metrics">
      <div><span><Users size={14}/>현재 체류</span><strong>{d.inside}<small>명</small></strong><p>전체 {d.total}명 · 입장 예정 {d.expected}명</p><i style={{width:`${d.total?d.inside/d.total*100:0}%`}}/></div>
      <div><span><Grid2X2 size={14}/>평균 인구밀도</span><strong>{density.average.toFixed(2)}<small>명/㎡</small></strong><p>지도 안 {density.counted}명 / 가정 면적 {density.area}㎡</p><i className="cyan"/></div>
      <div><span><Layers3 size={14}/>격자 최고 밀도</span><strong>{density.peak.toFixed(2)}<small>명/㎡</small></strong><p>2m 격자 · 가장자리는 실제 면적</p><i className="amber"/></div>
      <div><span><Activity size={14}/>이동 · 출구 대기</span><strong>{d.moving}<small>명 이동</small><em>{d.waiting}<small>명 대기</small></em></strong><p>이동 경로 대기 {d.blocked}명 별도</p><i className="violet"/></div>
    </div>
    <div className="analytics-grid analytics-scene-row">
      <section className="analytics-card analytics-wide analytics-scene-card" aria-label="실시간 3D 관제"><header><div><span className="analytics-kicker">LIVE DIGITAL TWIN</span><h2>AWS 해커톤 행사장</h2></div><span className={`analytics-signal ${d.running?'':'stopped'}`}><i/>{d.running?'LIVE':'PAUSED'} · {d.agenda?eventTime(d.agenda.minute):seconds(d.time)}</span></header><div ref={sceneSlot} className="analytics-scene"><div className="analytics-scene-label">{d.agenda?phaseAt(d.agenda.minute).title:'자율 시뮬레이션'}<span>{d.total} SYNTHETIC AGENTS</span></div></div><footer><div><button aria-label={d.running?'분석 시뮬레이션 일시정지':'분석 시뮬레이션 재생'} onClick={()=>world.setRunning(!d.running)} disabled={!d.ready}>{d.running?<Pause size={13}/>:<Play size={13}/>}<span>{d.running?'일시정지':'재생'}</span></button><button className={camera==='overview'?'selected':''} onClick={()=>useUI.getState().setCamera('overview')}><Box size={13}/>조감도</button><button className={camera==='top'?'selected':''} onClick={()=>useUI.getState().setCamera('top')}><Grid2X2 size={13}/>평면</button><button aria-pressed={heatmap} onClick={()=>useUI.getState().toggle('heatmap')}><Layers3 size={13}/>밀도</button></div><button onClick={openLive}><Maximize2 size={13}/><span>전체 화면 관제</span></button></footer></section>
      <PersonCard people={data.people}/>
    </div>
    <LiveCharts data={data} animate={animate}/><ExperimentCharts animate={animate}/>
    <footer className="analytics-footer"><span>JEONJO <b>·</b> 공간을 이해하고, 사람을 지키다.</span><span>모든 수치는 시뮬레이션 계산값입니다. 실측 인원·사고 확률과 구분해 사용합니다.</span></footer>
  </div>;
}
