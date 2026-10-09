import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { World } from './world';
import { AGENDA, phaseAt } from './agenda';

describe('행사 시간표와 인물 행동',()=>{
  const world=new World();
  beforeAll(async()=>{await world.initialize();});
  afterAll(()=>{world.people.forEach(p=>p.actor.stop());world.navigation.destroy();});
  const run=(seconds:number)=>{const seen=new Set<string>();for(let i=0;i<seconds*20;i++){world.tick(.05);world.people.forEach(p=>seen.add(p.state));}return seen;};
  test('17:00 마감과 짧은 발표 구간의 경계를 정확하게 선택한다',()=>{
    expect(phaseAt(584.99).id).toBe('recap');expect(phaseAt(585).id).toBe('aws');
    expect(phaseAt(1019.99).id).toBe('build_pm');expect(phaseAt(1020).id).toBe('review');
    expect(phaseAt(1030).id).toBe('tracks');expect(phaseAt(1260).id).toBe('closing');
  });
  test('출입구가 닫히면 체크인을 기다리고 개방 후 입장해 각자 좌석을 사용한다',()=>{
    world.startAgenda(540);for(const id of ['A','B','C'] as const)world.toggleExit(id,false);
    run(10);expect(world.snapshot().expected).toBe(108);expect(world.snapshot().inside).toBe(12);
    for(const id of ['A','B','C'] as const)world.toggleExit(id,true);
    run(110);expect(world.snapshot().expected).toBe(0);expect(world.snapshot().inside).toBe(120);
    expect(new Set(world.people.filter(p=>p.role==='participant').map(p=>p.seat?.id)).size).toBe(108);
    expect(world.people.filter(p=>p.state==='preparing').length).toBeGreaterThan(90);
  },30000);
  test('점심에는 자율배식·식사·개발이 함께 진행되고 임의 퇴장이 없다',()=>{
    world.startAgenda(720);const seen=run(85);
    for(const state of ['serving','eating','working'])expect(seen.has(state)).toBe(true);
    expect(world.snapshot().outside).toBe(0);expect(world.snapshot().inside).toBe(120);
    expect(world.agenda?.minute).toBe(720);
  },30000);
  test('제출 마감 후 코딩을 멈추고 운영진이 제출·발표 상태를 확인한다',()=>{
    world.startAgenda(1020);const seen=run(40);expect(seen.has('checking')).toBe(true);
    expect(world.people.filter(p=>p.role==='participant').every(p=>p.state!=='working')).toBe(true);
    expect(world.logs.some(log=>log.title.includes('17:00'))).toBe(true);
  });
  test('1차 발표에서 발표자·심사·식사·네트워킹이 병행된다',()=>{
    world.startAgenda(1030);const seen=run(75);
    for(const state of ['presenting','judging','networking','eating','listening'])expect(seen.has(state)).toBe(true);
  },30000);
  test('단체사진 집결 후 퇴장 장면은 출입구 통과로 집계된다',()=>{
    world.startAgenda(1240);const seen=run(60);expect(seen.has('photograph')).toBe(true);expect(world.snapshot().outside).toBe(0);
    world.startAgenda(1250);run(180);expect(world.snapshot().outside,JSON.stringify(world.people.filter(p=>p.role==='participant'&&p.state!=='outside').map(p=>({id:p.id,state:p.state,stage:p.stage,position:p.position,goal:p.goal,exit:p.exit,path:p.path,nearby:world.people.filter(n=>n.id!==p.id&&n.state!=='outside'&&Math.hypot(n.position.x-p.position.x,n.position.z-p.position.z)<1.5).map(n=>({id:n.id,state:n.state,position:n.position}))})))).toBe(108);expect(world.snapshot().inside).toBe(12);
  },30000);
  test('행사 일시정지는 시계와 이동을 함께 멈춘다',()=>{
    world.startAgenda(600,true);world.setRunning(false);const time=world.time,minute=world.agenda!.minute;
    world.advance(.1);expect(world.time).toBe(time);expect(world.agenda!.minute).toBe(minute);
  });
  test('시간표에 맞지 않는 OpenAI 조치를 거절하고 식사 순차 이동을 실제로 적용한다',()=>{
    world.startAgenda(600);expect(world.applyDecision('stagger_meals')).toBe(false);
    world.startAgenda(720);expect(world.applyDecision('stagger_meals')).toBe(true);
    expect(world.agenda?.strategy).toBe('stagger_meals');
    const people=world.people.filter(p=>p.role==='participant');
    expect(people[100].nextAction-people[0].nextAction).toBeGreaterThanOrEqual(30);
    expect(world.applyDecision('guide_departure')).toBe(false);
  });
  test('하루 전체 자동 진행이 모든 단계와 최종 퇴장을 연결한다',()=>{
    world.startAgenda(540,true);const phases=new Set<string>();
    for(let i=0;i<900*20;i++){world.tick(.05);phases.add(world.agenda!.phaseId);if(i%200===0){const s=world.snapshot();expect(s.inside+s.outside+s.expected).toBe(120);}}
    expect([...phases]).toEqual(AGENDA.map(a=>a.id));expect(world.agenda?.minute).toBe(1260);expect(world.agenda?.auto).toBe(false);
    expect(world.snapshot().expected).toBe(0);expect(world.snapshot().outside).toBe(108);
  },30000);
});
