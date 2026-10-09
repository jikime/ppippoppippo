import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEATS, TABLES } from '../simulation/layout';

export function signTexture(title:string,subtitle='',dark=false){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=dark?'#153d37':'#f3f1eb';ctx.fillRect(0,0,1024,512);
  ctx.fillStyle=dark?'#8ef0bd':'#526c63';ctx.font='600 24px system-ui';ctx.fillText('AWS  /  BUILDER EXPERIENCE',65,74);
  ctx.fillStyle=dark?'#fbfff8':'#223d36';ctx.font='600 84px system-ui';
  title.split('\n').forEach((line,i)=>ctx.fillText(line,62,196+i*100));
  ctx.fillStyle=dark?'#aac6b7':'#789087';ctx.font='25px system-ui';ctx.fillText(subtitle,65,440);
  ctx.fillStyle='#e9a54f';ctx.fillRect(65,365,82,5);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
export function codeTexture(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;const c=canvas.getContext('2d')!;
  c.fillStyle='#18342f';c.fillRect(0,0,128,96);c.fillStyle='#2e5048';c.fillRect(0,0,128,13);
  for(let i=0;i<9;i++){c.fillStyle=['#73a398','#bfcca2','#dcb07a'][i%3];c.fillRect(9+(i%3)*5,21+i*7,30+(i*13)%60,2);}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export function makeFurniture(){
  const groups=new Map<string,THREE.BufferGeometry[]>();
  const add=(g:THREE.BufferGeometry,color:string,x:number,y:number,z:number,rotation=0,center?:{x:number;z:number;heading:number})=>{
    g.rotateY(rotation);g.translate(x,y,z);
    if(center){g.rotateY(center.heading);g.translate(center.x,0,center.z);}
    const nonIndexed=g.index?g.toNonIndexed():g;
    if(!groups.has(color))groups.set(color,[]);groups.get(color)!.push(nonIndexed);
  };
  const box=(w:number,h:number,d:number)=>Math.min(w,h,d)<.06?new THREE.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,1,Math.min(.025,h*.2));
  for(const t of TABLES){
    add(box(2.8,.10,1.05),'#f6f4ed',t.x,.92,t.z);
    add(box(2.65,.04,.8),'#c5c9c5',t.x,.85,t.z);
    for(const dx of [-1.19,1.19]){
      add(box(.075,.78,.075),'#e4e6df',t.x+dx,.44,t.z);
      add(box(.10,.07,.84),'#c8cec9',t.x+dx,.085,t.z);
      for(const dz of [-.32,.32]){const g=new THREE.CylinderGeometry(.058,.058,.07,6);g.rotateZ(Math.PI/2);add(g,'#3c4543',t.x+dx,.056,t.z+dz);}
    }
    add(new THREE.CylinderGeometry(.065,.064,.27,8),'#789c94',t.x+1.12,1.105,t.z+.10);
    add(new THREE.CylinderGeometry(.035,.035,.04,8),'#eceae2',t.x+1.12,1.26,t.z+.10);
    add(box(.19,.014,.28),'#c78f63',t.x-.98,.98,t.z-.12,.1);
    add(box(.28,.34,.16),'#494e4c',t.x+1,.22,t.z+.55,.1);
  }
  for(const s of SEATS){
    const center={x:s.x,z:s.z,heading:s.heading};
    add(box(.44,.075,.43),'#36413f',0,.49,0,0,center);
    add(box(.44,.09,.065),'#36413f',0,.99,-.20,0,center);
    for(const dx of [-.18,-.09,0,.09,.18])add(box(.047,.42,.055),'#46514d',dx,.80,-.20,0,center);
    for(const dx of [-.20,.20]){
      add(box(.035,.45,.035),'#959d96',dx,.26,-.15,0,center);
      add(box(.035,.45,.035),'#959d96',dx,.26,.15,0,center);
      add(box(.04,.04,.36),'#36413f',dx,.69,0,0,center);
      add(box(.035,.19,.035),'#697970',dx,.60,-.10,0,center);
    }
    // Laptop facing its owner's seat, with an actual emissive code screen.
    const table=TABLES.find(t=>t.id===s.table)!;
    const laptop={x:s.x,z:table.z+(s.z>table.z?.20:-.20),heading:s.z>table.z?0:Math.PI};
    add(box(.47,.022,.31),'#a0aaa6',0,.986,0,0,laptop);
    const screen=box(.46,.28,.018);screen.rotateX(-.15);add(screen,'#3b4e47',0,1.12,-.12,0,laptop);
    const display=new THREE.PlaneGeometry(.42,.24);display.rotateX(-.15);add(display,'screen',0,1.12,-.101,0,laptop);
    add(box(.26,.009,.12),'#54645b',0,1.003,-.01,0,laptop);
  }
  return [...groups].map(([color,geometries])=>({color,geometry:mergeGeometries(geometries,false)}));
}
