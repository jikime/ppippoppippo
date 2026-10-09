export type Vec = { x: number; y: number; z: number };
export type ExitId = 'A' | 'B' | 'C';
export const ROOM = { width: 29, depth: 14, height: 3.45 };
export const TABLES = [-3.5, 0, 3.5].flatMap((z,row) => [-10,-6,-2,2,6,10].map((x,col)=>({id:`T${String(row*6+col+1).padStart(2,'0')}`,x,z,row,col})));
export const SEATS = TABLES.flatMap(t=>[-1,1].flatMap(side=>[-.82,0,.82].map((dx,i)=>({id:`${t.id}-${side}-${i}`,table:t.id,x:t.x+dx,z:t.z+side*.98,heading:side===1?Math.PI:0}))));
export const EXITS: {id:ExitId; name:string; x:number; z:number; capacity:number}[] = [
  {id:'A',name:'서측 출입구',x:-12,z:7,capacity:.8},
  {id:'B',name:'중앙 출입구',x:0,z:7,capacity:1.1},
  {id:'C',name:'동측 출입구',x:12,z:7,capacity:1.4},
];
export const PATROL:Vec[]=[{x:-12,y:0,z:-5.8},{x:0,y:0,z:-5.8},{x:12,y:0,z:-5.8},{x:12,y:0,z:5.6},{x:0,y:0,z:5.6},{x:-12,y:0,z:5.6}];
export const distance=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.z-b.z);
export const vector=(x:number,z:number):Vec=>({x,y:0,z});
export const roleNames={participant:'참가자',operator:'운영요원',judge:'심사위원',host:'발표자'};
export const stateNames={working:'팀 프로젝트 작업',walking:'목적지로 이동',waiting:'출입구 대기',guiding:'동선 안내',visiting:'팀 방문 · 심사',outside:'퇴장 완료',presenting:'발표 진행',idle:'주변 확인',blocked:'이동 경로 대기'};
export const roleColors={participant:'#60869c',operator:'#15a97d',judge:'#c09b65',host:'#a195c8'};
