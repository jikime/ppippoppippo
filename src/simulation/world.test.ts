import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { World } from './world';
import { TABLES } from './layout';

const world=new World();
const run=(seconds:number)=>{for(let i=0;i<seconds*20;i++)world.tick(.05);};
beforeAll(async()=>{await world.initialize();if(world.error)throw new Error(world.error);},30000);
afterAll(()=>{world.people.forEach(p=>p.actor.stop());world.navigation.destroy();});

describe('shared venue simulation',()=>{
  test('initial population, roles, and seat ownership agree',()=>{
    world.reset();const s=world.snapshot();expect(s.total).toBe(120);expect(s.inside).toBe(120);expect(s.working).toBe(96);
    expect(new Set(world.people.map(p=>p.id)).size).toBe(120);
    expect(Object.fromEntries(['participant','operator','paramedic','judge','host'].map(role=>[role,world.people.filter(p=>p.role===role).length]))).toEqual({participant:108,operator:3,paramedic:2,judge:6,host:1});
    expect(world.people.every(p=>p.id===p.profile.id&&p.role===p.profile.role)).toBe(true);
    expect(world.people.filter(p=>p.role==='paramedic').map(p=>p.variant)).toEqual(['paramedic','paramedic']);
    const seats=world.people.flatMap(p=>p.seat?[p.seat.id]:[]);expect(new Set(seats).size).toBe(96);
  });
  test('normal activity includes moving judges and operators while seated people keep their seats',()=>{
    world.reset();const judge=world.people.find(p=>p.id==='J1')!;const start={...judge.position};run(10);
    expect(Math.hypot(judge.position.x-start.x,judge.position.z-start.z)).toBeGreaterThan(.3);
    expect(world.snapshot().working).toBe(96);expect(world.snapshot().outside).toBe(0);
  });
  test('pause freezes the authoritative clock and positions',()=>{
    world.reset('break');run(8);world.setRunning(false);const time=world.time;const positions=world.people.map(p=>({...p.position}));
    for(let i=0;i<20;i++)world.advance(.1);
    expect(world.time).toBe(time);expect(world.people.map(p=>p.position)).toEqual(positions);world.setRunning(true);
  });
  test('break flow conserves people and cannot walk through table volumes',()=>{
    world.reset('break');let penetrations=0;
    for(let i=0;i<1800;i++){
      world.tick(.05);const s=world.snapshot();expect(s.inside+s.outside).toBe(120);
      expect(s.waiting).toBe(s.exits.reduce((sum,e)=>sum+e.queue,0));
      for(const p of world.people)if(p.state!=='outside')for(const t of TABLES)if(Math.abs(p.position.x-t.x)<1.35&&Math.abs(p.position.z-t.z)<.50)penetrations++;
    }
    expect(penetrations).toBe(0);expect(world.snapshot().outside).toBeGreaterThan(70);
  },30000);
  test('all exits closed holds participants, reopening an exit resumes movement',()=>{
    world.reset('break');world.toggleExit('A',false);world.toggleExit('B',false);world.toggleExit('C',false);run(25);
    expect(world.snapshot().outside).toBe(0);expect(world.snapshot().blocked).toBe(108);
    world.toggleExit('C',true);run(65);
    expect(world.snapshot().outside).toBeGreaterThan(20);expect(world.exits.find(e=>e.id==='A')!.departed).toBe(0);expect(world.exits.find(e=>e.id==='B')!.departed).toBe(0);
  },30000);
  test('closed center exit never releases a participant and guide dispatch reaches actual positions',()=>{
    world.reset('incident');world.dispatch();run(60);
    expect(world.exits.find(e=>e.id==='B')!.departed).toBe(0);
    expect(world.people.filter(p=>p.state==='guiding').length).toBeGreaterThanOrEqual(3);
    expect(world.snapshot().outside).toBeGreaterThan(25);
  },30000);
  test('reset restores the full venue including doors and queues',()=>{
    world.reset();const s=world.snapshot();expect(s.time).toBe(0);expect(s.inside).toBe(120);expect(s.outside).toBe(0);expect(s.waiting).toBe(0);expect(s.exits.every(e=>e.open)).toBe(true);expect(s.guidance).toBe(false);
  });
  test('person monitoring records final goals, freezes while paused and resets between worlds',()=>{
    world.reset('break');run(5);world.publish();const p=world.people[0],m=world.monitor.get(p.id)!;
    expect(m.goal).toBe(p.goalName);expect(m.events[0].detail).toBe(p.goalName);
    const history=structuredClone(m);world.setRunning(false);world.advance(.1);world.publish();expect(world.monitor.get(p.id)).toEqual(history);
    world.reset();expect(world.monitor.get(p.id)?.speeds).toHaveLength(1);expect(world.monitor.get(p.id)?.events[0].time).toBe(0);
  });
  test('all 108 participants eventually exit without stranded queues',()=>{
    world.reset('break');run(180);expect(world.snapshot().outside).toBe(108);expect(world.snapshot().waiting).toBe(0);expect(world.snapshot().inside).toBe(12);
  },30000);
  test('normal participants can leave and return to their own reserved seat',()=>{
    world.reset();const p=world.people.find(p=>p.id==='P001')!;const seat=p.seat!.id;let left=false,returned=false;
    for(let i=0;i<2800;i++){world.tick(.05);if(p.state==='walking')left=true;if(left&&p.state==='working'){returned=true;break;}}
    expect(returned).toBe(true);expect(p.seat!.id).toBe(seat);
  },30000);
  test('guided incident completes even with the center exit closed',()=>{
    world.reset('incident');world.dispatch();run(180);expect(world.snapshot().outside).toBe(108);expect(world.snapshot().guides).toBe(5);
    expect(world.people.filter(p=>p.role==='paramedic').every(p=>p.state==='guiding'&&p.goalName.includes('응급지원'))).toBe(true);
  },30000);
  test('reopening one exit after a complete closure can clear the whole venue',()=>{
    world.reset('break');for(const id of ['A','B','C'] as const)world.toggleExit(id,false);run(20);world.toggleExit('C',true);run(200);expect(world.snapshot().outside).toBe(108);
  },30000);
  test('the complete presentation timeline releases all participants and restores the center exit',()=>{
    world.startStory();run(150);const s=world.snapshot();expect(s.story).toBe(false);expect(s.storyStep).toBe(5);expect(s.outside).toBe(108);expect(s.exits.every(e=>e.open)).toBe(true);expect(s.guides).toBe(5);
  },30000);
});
