import { ROOM } from '../simulation/layout';
import { FINDINGS, HAZARDS, findingValue, regressionKeys } from '../lab/model';
import type { FindingKey, Hazard, PairResult } from '../lab/model';

type LocatedPerson = {id:string;state:string;position:{x:number;z:number}};
export interface DensityCell {col:number;row:number;x:number;z:number;width:number;depth:number;area:number;count:number;density:number;ids:string[]}

/** Floor area includes furniture. A boundary cell uses its actual clipped area. */
export function densityGrid(people:LocatedPerson[],cellSize=2) {
  if(!Number.isFinite(cellSize)||cellSize<=0)throw new RangeError('격자 크기는 양수여야 합니다.');
  const cols=Math.ceil(ROOM.width/cellSize),rows=Math.ceil(ROOM.depth/cellSize);
  const cells:DensityCell[]=Array.from({length:cols*rows},(_,i)=>{
    const col=i%cols,row=Math.floor(i/cols),width=Math.min(cellSize,ROOM.width-col*cellSize),depth=Math.min(cellSize,ROOM.depth-row*cellSize);
    return {col,row,x:-ROOM.width/2+col*cellSize,z:-ROOM.depth/2+row*cellSize,width,depth,area:width*depth,count:0,density:0,ids:[]};
  });
  let outsideFootprint=0;
  for(const p of people){
    if(p.state==='outside'||p.state==='notArrived')continue;
    const {x,z}=p.position;
    if(!Number.isFinite(x)||!Number.isFinite(z)||x< -ROOM.width/2||x>ROOM.width/2||z< -ROOM.depth/2||z>ROOM.depth/2){outsideFootprint++;continue;}
    const col=Math.min(cols-1,Math.floor((x+ROOM.width/2)/cellSize));
    const row=Math.min(rows-1,Math.floor((z+ROOM.depth/2)/cellSize));
    const cell=cells[row*cols+col];cell.count++;cell.ids.push(p.id);cell.density=cell.count/cell.area;
  }
  const counted=cells.reduce((n,c)=>n+c.count,0),area=ROOM.width*ROOM.depth;
  return {cells,cols,rows,area,counted,outsideFootprint,average:counted/area,peak:Math.max(0,...cells.map(c=>c.density))};
}

export const shortFindingNames:Record<FindingKey,string>={unresolved:'대응 미완료',riskyRoutes:'위험 구역 경로',unassisted:'지원 미배정',allergyExposures:'식재료 확인 누락',lateResponse:'반응 지연',missingProtocol:'절차 공백',maxQueue:'출구 대기 집중'};
export function experimentSummary(results:PairResult[],hazard:Hazard|'all'='all') {
  const selected=hazard==='all'?results:results.filter(r=>r.conditions.hazard===hazard);
  const findings=(Object.keys(FINDINGS) as FindingKey[]).map(key=>({
    key,name:shortFindingNames[key],before:selected.filter(r=>findingValue(r.before,key)>0).length,
    after:selected.filter(r=>findingValue(r.after,key)>0).length,
    regressed:selected.filter(r=>findingValue(r.after,key)>findingValue(r.before,key)).length,
  }));
  let improved=0,unchanged=0,regressed=0;
  for(const r of selected){
    if(regressionKeys(r).length)regressed++;
    else if((Object.keys(FINDINGS) as FindingKey[]).some(k=>findingValue(r.after,k)<findingValue(r.before,k)))improved++;
    else unchanged++;
  }
  // Security acknowledgement and meal completion are not evacuation outcomes.
  const evacuation=selected.filter(r=>r.conditions.hazard==='fire'||r.conditions.hazard==='blackout');
  const histogram=Array.from({length:8},(_,i)=>({name:`${i*15}–${i===7?120:i*15+14}`,before:0,after:0}));
  for(const r of evacuation)for(const variant of ['before','after'] as const)histogram[Math.min(7,Math.floor(r[variant].maxQueue/15))][variant]++;
  const exitLoads=['A','B','C'].map((name,i)=>({name,
    before:evacuation.length?evacuation.reduce((n,r)=>n+r.before.exitLoads[i],0)/evacuation.length:0,
    after:evacuation.length?evacuation.reduce((n,r)=>n+r.after.exitLoads[i],0)/evacuation.length:0,
  }));
  return {selected,findings,improved,unchanged,regressed,evacuation,histogram,exitLoads,
    hazards:HAZARDS.map(key=>({key,count:selected.filter(r=>r.conditions.hazard===key).length})),
    examples:selected.filter(r=>regressionKeys(r).length).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,6),
  };
}
