import { describe,expect,it } from 'vitest';
import { densityGrid,experimentSummary } from './data';
import { BASELINE,IMPROVED } from '../lab/model';
import { runPair } from '../lab/engine';

describe('분석 수치',()=>{
  it('경계 격자의 실제 면적과 닫힌 외곽 경계로 밀도를 계산한다',()=>{
    const p=(id:string,x:number,z:number,state='working')=>({id,position:{x,z},state});
    const grid=densityGrid([p('west',-14.5,-7),p('east',14.5,7),p('mid',0,0),p('transit',0,7.1),p('gone',0,0,'outside'),p('expected',0,0,'notArrived')]);
    expect(grid.cells.reduce((n,c)=>n+c.area,0)).toBe(406);
    expect(grid.counted).toBe(3);expect(grid.outsideFootprint).toBe(1);
    const east=grid.cells.find(c=>c.ids.includes('east'))!;
    expect(east.area).toBe(2);expect(east.density).toBe(.5);
    expect(grid.average).toBe(3/406);
    expect(grid.cells.flatMap(c=>c.ids).sort()).toEqual(['east','mid','west']);
  });
  it('빈 공간은 0이며 잘못된 좌표가 NaN을 전파하지 않는다',()=>{
    const g=densityGrid([{id:'bad',state:'idle',position:{x:NaN,z:0}}]);
    expect(g.average).toBe(0);expect(g.peak).toBe(0);expect(g.outsideFootprint).toBe(1);
    expect(()=>densityGrid([],0)).toThrow(RangeError);
  });
  const config={seed:20261009,count:20,hazard:'mixed' as const,horizon:180,baseline:BASELINE,candidate:IMPROVED};
  const results=Array.from({length:20},(_,i)=>runPair(config,i));
  it('모든 세계를 개선·동일·악화 중 한 번만 집계한다',()=>{
    const s=experimentSummary(results);
    expect(s.improved+s.unchanged+s.regressed).toBe(20);
    expect(s.hazards.reduce((n,h)=>n+h.count,0)).toBe(20);
  });
  it('대피 그래프는 화재·정전만 사용하고 모든 관측치를 보존한다',()=>{
    const s=experimentSummary(results);
    for(const variant of ['before','after'] as const)expect(s.histogram.reduce((n,b)=>n+b[variant],0)).toBe(s.evacuation.length);
    expect(experimentSummary(results,'security').evacuation).toHaveLength(0);
    expect(experimentSummary(results,'allergy').exitLoads.every(e=>e.before===0&&e.after===0)).toBe(true);
  });
  it('개선과 악화가 공존하는 세계를 악화 집계에서 빼지 않는다',()=>{
    const r=structuredClone(results[0]);r.before.riskyRoutes=10;r.after.riskyRoutes=0;r.before.unresolved=0;r.after.unresolved=1;
    const s=experimentSummary([r]);expect(s.regressed).toBe(1);expect(s.improved).toBe(0);
    expect(s.findings.find(f=>f.key==='unresolved')?.regressed).toBe(1);
  });
  it('실험이 없을 때 0명과 계산 전 상태를 구분할 수 있다',()=>{
    const s=experimentSummary([]);expect(s.selected).toHaveLength(0);expect(s.evacuation).toHaveLength(0);
    expect(s.findings.every(f=>f.before===0&&f.after===0)).toBe(true);
  });
  it('최대 120명인 대기값도 히스토그램의 마지막 구간에 포함한다',()=>{
    const r=structuredClone(results[0]);r.conditions.hazard='fire';r.before.maxQueue=120;r.after.maxQueue=0;
    const s=experimentSummary([r]);expect(s.histogram[7].before).toBe(1);expect(s.histogram[0].after).toBe(1);
  });
});
