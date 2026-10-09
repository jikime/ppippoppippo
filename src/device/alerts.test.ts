import { describe, expect, test } from 'vitest';
import type { Snapshot } from '../simulation/world';
import { KINDS, catalog, displayFor, parseAlerts, SimulationAlerts } from './alerts';

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {ready:true,error:null,revision:1,inside:120,waiting:0,blocked:0,
    exits:['A','B','C'].map(id=>({id,open:true,queue:0,assigned:0,departed:0})),...overrides} as Snapshot;
}
const has = (rules: SimulationAlerts, s: Snapshot, now: number, kind: string) => rules.update(s,now).some(a=>a.kind===kind);
describe('디바이스 경고 판단',()=>{
  test('펌웨어와 브리지에서 사용하는 경고 ID 순서가 유지된다',()=>{
    expect(catalog.kinds.map(a=>a.id)).toEqual([...KINDS]);
  });
  test('세 출입구 통제는 즉시 최상위 통제 경고가 되고 한 곳이 열리면 개별 통제로 돌아간다',()=>{
    const rules=new SimulationAlerts(), s=snapshot();
    s.exits.forEach(e=>{e.open=false;});
    expect(rules.update(s,0)).toEqual([{kind:'all_exits_closed',zone:0,source:'simulation'}]);
    s.exits[1].open=true;
    expect(rules.update(s,1).map(a=>[a.kind,a.zone])).toEqual([['exit_closed',1],['exit_closed',3]]);
  });
  test('짧은 대기는 무시하며 정체 경고의 진입과 해제에 각각 지속 시간이 필요하다',()=>{
    const rules=new SimulationAlerts(), s=snapshot({waiting:13});
    expect(has(rules,s,0,'congestion')).toBe(false);
    expect(has(rules,s,4999,'congestion')).toBe(false);
    expect(has(rules,s,5000,'congestion')).toBe(true);
    s.waiting=10; expect(has(rules,s,20000,'congestion')).toBe(true);
    s.waiting=8; expect(has(rules,s,21000,'congestion')).toBe(true);
    expect(has(rules,s,25999,'congestion')).toBe(true);
    expect(has(rules,s,26000,'congestion')).toBe(false);
  });
  test('경로 막힘은 3초 지속 시 표시하고 시뮬레이션 초기화는 이전 누적 시간을 지운다',()=>{
    const rules=new SimulationAlerts(), s=snapshot({blocked:2});
    expect(has(rules,s,0,'route_blocked')).toBe(false);
    expect(has(rules,s,3000,'route_blocked')).toBe(true);
    s.revision++; expect(has(rules,s,3001,'route_blocked')).toBe(false);
    expect(has(rules,s,6001,'route_blocked')).toBe(true);
  });
  test('중복은 한 번 세고 화재 경고가 통제보다 먼저 표시된다',()=>{
    const fire={kind:'fire',zone:2,source:'test'} as const;
    expect(displayFor([{kind:'exit_closed',zone:1,source:'simulation'},fire,fire],true))
      .toEqual({kind:'fire',zone:2,source:'test',count:2,fresh:true});
  });
  test.each([
    [{kind:'fire\r\nsys_reboot',zone:0,source:'test'}],
    [{kind:'fire',zone:4,source:'test'}], [{kind:'fire',zone:0,source:'camera'}],
    Array(33).fill({kind:'fire',zone:0,source:'test'}),
  ].map(input=>[input]))('검증되지 않은 경고 입력을 거부한다',input=>{ expect(()=>parseAlerts(input)).toThrow(); });
});
