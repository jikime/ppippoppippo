import { useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ArrowLeft, ChevronRight, Eye, Focus, Search, UserRound } from 'lucide-react';
import { useUI } from '../state';
import { world } from '../simulation/world';
import { roleNames, stateNames } from '../simulation/layout';
import { allergyName } from '../simulation/profiles';
import type { Persona } from '../simulation/profiles';
import './people.css';

const useWatch=create(persist<{ids:string[];notes:Record<string,string>;toggle:(id:string)=>void;note:(id:string,value:string)=>void}>((set)=>({
  ids:[],notes:{},toggle:id=>set(s=>({ids:s.ids.includes(id)?s.ids.filter(x=>x!==id):[...s.ids,id]})),
  note:(id,value)=>set(s=>({notes:{...s.notes,[id]:value.slice(0,400)}})),
}),{name:'crowdguard-synthetic-watch-v1'}));
export function PersonaTraits({profile:p}:{profile:Persona}){
  return <><div className="person-traits">{[p.needsAssistance?'이동 지원 필요':'독립 이동',p.visualNotice?'화면 안내 필요':'음성 안내 수신',p.companion?'동반자 확인':'개별 이동',`알레르기 · ${allergyName[p.allergy]}`].map(t=><span key={t}>{t}</span>)}</div>
    <dl className="person-facts"><div><dt>보행 속도 가정</dt><dd>{p.walkSpeed.toFixed(2)} m/s</dd></div><div><dt>반응 시간 가정</dt><dd>{p.reactionSeconds}초</dd></div><div><dt>공간 친숙도 가정</dt><dd>{Math.round(p.familiarity*100)} / 100</dd></div></dl></>;
}
export function PeoplePanel(){
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all');
  const selected=useUI(s=>s.selected),d=useUI(s=>s.data),watch=useWatch();
  const p=world.people.find(p=>p.id===selected),history=p?world.monitor.get(p.id):undefined;
  if(p){
    const profile=p.profile,watching=watch.ids.includes(p.id);
    const queue=world.exits.find(e=>e.queue.includes(p.id));
    return <div className="person-detail" key={p.id}>
      <button className="person-back" onClick={()=>useUI.getState().select(null)}><ArrowLeft size={14}/>전체 인물 목록</button>
      <section className="person-hero"><div><UserRound size={17}/><span>선택한 합성 참가자</span><button aria-label={watching?'관찰 해제':'관찰 등록'} aria-pressed={watching} onClick={()=>watch.toggle(p.id)}><Eye size={17}/></button></div><small>{p.id} · PERSONA {String(p.ordinal+1).padStart(3,'0')}</small><h3>{profile.name}</h3><p>{profile.job}</p><div className="person-badges"><span>{roleNames[p.role]}</span><span>{profile.team}</span><span>가상 인물</span></div></section>
      <section className={`person-status ${p.state==='blocked'?'attention':''}`}><i/><div><b>{stateNames[p.state]}</b><small>현재 상태 {(Math.max(0,d.time-(history?.since??d.time))).toFixed(0)}초 지속 · {watching?'관찰 중':'일반 모니터링'}</small></div></section>
      <dl className="person-facts"><div><dt>현재 목적지</dt><dd>{p.goalName}</dd></div><div><dt>현재 이동 속도</dt><dd>{p.speed.toFixed(2)} m/s</dd></div><div><dt>누적 이동 거리</dt><dd>{p.stepDistance.toFixed(1)} m</dd></div><div><dt>출구 대기 순서</dt><dd>{queue?`${queue.id} · ${queue.queue.indexOf(p.id)+1}번째`:'대기열 없음'}</dd></div></dl>
      <div className="person-speed"><span>최근 60초 이동 속도</span><svg viewBox="0 0 280 45" aria-label="시뮬레이션에서 측정한 최근 이동 속도"><path d="M0 43H280" stroke="#dce4ec"/><polyline fill="none" stroke="#80ca19" strokeWidth="2" points={(history?.speeds??[]).map((s,i,all)=>`${i/Math.max(1,all.length-1)*280},${43-Math.min(1.7,s.speed)/1.7*40}`).join(' ')}/></svg></div>
      <div className="person-objective"><b>참여 목적</b><p>{profile.objective}</p></div>
      <button className="follow-button" disabled={p.state==='outside'||p.state==='notArrived'} onClick={()=>useUI.getState().setCamera('follow')}><Focus size={15}/>이 인물 가까이 보기</button>
      <h4 className="person-section-title">세계 실험에 사용하는 페르소나</h4><PersonaTraits profile={profile}/>
      <p className="person-note">프로필의 가정은 다중 세계 실험에 반영됩니다. 위의 현재 속도는 행사장 군중 모형의 측정값입니다. 사진 속 실제 인물의 신상·건강 정보를 추정하지 않습니다.</p>
      <h4 className="person-section-title">관찰 메모</h4><textarea aria-label="합성 인물 관찰 메모" value={watch.notes[p.id]??''} onChange={e=>watch.note(p.id,e.target.value)} placeholder="이 가상 인물의 관찰 사항" maxLength={400}/><small className="person-note">이 브라우저에 저장됩니다.</small>
      <h4 className="person-section-title">행동 이력</h4><ol className="person-history">{history?.events.map((event,i)=><li key={`${event.time}-${i}`}><time>+{event.time.toFixed(1)}s</time><div><b>{event.title}</b><span>{event.detail}</span></div></li>)}</ol>
    </div>;
  }
  const q=query.trim().toLocaleLowerCase();
  const people=world.people.filter(p=>(filter==='all'||filter==='watch'&&watch.ids.includes(p.id)||filter==='attention'&&['blocked','waiting'].includes(p.state)||p.role===filter)&&
    [p.id,p.profile.name,p.profile.team,p.profile.job,roleNames[p.role]].some(t=>t.toLocaleLowerCase().includes(q)));
  return <><div className="people-filters"><label className="search-input"><Search size={15}/><input aria-label="인물 검색" placeholder="이름, ID, 팀, 역할 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="역할 필터" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">모든 인물</option><option value="watch">관찰 등록 ({watch.ids.length})</option><option value="attention">대기·경로 확인</option>{Object.entries(roleNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
    <div className="people-count">{people.length}명의 합성 인물 · 클릭하여 상태 확인</div><div className="people-list">{people.map(p=><button key={p.id} onClick={()=>useUI.getState().select(p.id)}><span className={`role-dot ${p.role}`}/><span><b>{p.profile.name} <small>{p.id}</small></b><small>{p.profile.team} · {p.profile.job}</small></span><em>{stateNames[p.state]}</em>{watch.ids.includes(p.id)?<Eye size={13}/>:<ChevronRight size={13}/>}</button>)}{!people.length&&<div className="empty-state">검색 결과가 없습니다.</div>}</div></>;
}
