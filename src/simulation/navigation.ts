import { init, Crowd, NavMeshQuery } from 'recast-navigation';
import type { NavMesh, TileCache, Obstacle } from 'recast-navigation';
import { generateTileCache } from 'recast-navigation/generators';
import { BoxGeometry, PlaneGeometry } from 'three';
import { EXITS, TABLES } from './layout';
import type { ExitId, Vec } from './layout';

let initialization:Promise<unknown>|undefined;
export class Navigation {
  navMesh!:NavMesh;
  tileCache!:TileCache;
  crowd!:Crowd;
  query!:NavMeshQuery;
  obstacles=new Map<ExitId,Obstacle>();
  async initialize(){
    initialization ??= init(); await initialization;
    const positions:number[]=[],indices:number[]=[];
    const append=(g:BoxGeometry|PlaneGeometry)=>{
      const offset=positions.length/3;
      positions.push(...g.attributes.position.array);
      indices.push(...Array.from(g.index!.array,n=>n+offset));g.dispose();
    };
    const floor=new PlaneGeometry(29,16.8); floor.rotateX(-Math.PI/2);floor.translate(0,0,.8);append(floor);
    // Solid navigation volumes match the furniture and perimeter, including three door gaps.
    const box=(x:number,z:number,w:number,d:number,h=3.5)=>{const g=new BoxGeometry(w,h,d);g.translate(x,h/2,z);append(g);};
    TABLES.forEach(t=>box(t.x,t.z,2.86,1.18,2));
    for(const x of [-14,14])for(const z of [-3.8,-.8,2.2])box(x,z,.62,1.5,1.1);
    box(0,-7,29,.24);box(-14.45,.1,.20,14.3);box(14.45,.1,.20,14.3);
    [[-13.725,1.45],[-6,9.8],[6,9.8],[13.725,1.45]].forEach(([x,w])=>box(x,7,w,.26));
    const result=generateTileCache(positions,indices,{cs:.10,ch:.10,tileSize:32,walkableHeight:17,walkableRadius:2,walkableClimb:1,walkableSlopeAngle:35,maxSimplificationError:1.1,maxObstacles:16,expectedLayersPerTile:2});
    if(!result.success)throw new Error(`이동 공간 생성 실패: ${result.error}`);
    this.navMesh=result.navMesh;this.tileCache=result.tileCache;
    this.query=new NavMeshQuery(this.navMesh);
    this.crowd=new Crowd(this.navMesh,{maxAgents:160,maxAgentRadius:.35});
  }
  closest(p:Vec){const found=this.query.findClosestPoint(p,{halfExtents:{x:2,y:3,z:2}});return found.success?found.point:p;}
  path(a:Vec,b:Vec){const result=this.query.computePath(a,b);return result.success?result.path:[];}
  setExit(id:ExitId,open:boolean){
    const obstacle=this.obstacles.get(id);
    if(open&&obstacle){this.tileCache.removeObstacle(obstacle);this.obstacles.delete(id);}
    if(!open&&!obstacle){const exit=EXITS.find(e=>e.id===id)!;const result=this.tileCache.addBoxObstacle({x:exit.x,y:1,z:7},{x:1.15,y:1.8,z:.25},0);if(!result.success)throw new Error('통로 상태를 반영하지 못했습니다.');this.obstacles.set(id,result.obstacle);}
    for(let i=0;i<30;i++)if(this.tileCache.update(this.navMesh).upToDate)break;
  }
  destroy(){this.crowd?.destroy();this.query?.destroy();this.tileCache?.destroy();this.navMesh?.destroy();}
}
