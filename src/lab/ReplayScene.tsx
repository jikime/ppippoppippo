import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line, useGLTF } from '@react-three/drei';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three';
import { useLab } from './store';
import { replayPositionAt } from './engine';
import { hazardNames } from './model';
import type { TraceAgent } from './model';
import { useUI } from '../state';
import { characterUrl, characterVariant } from '../simulation/appearance';
import { roleNames } from '../simulation/layout';
import { RoleDot } from '../people/RoleDot';
import { RoleMarker } from '../scene/RoleMarker';

function ReplayAvatar({agent:a}:{agent:TraceAgent}){
  const p=a.persona,variant=characterVariant(p.role,p.ordinal);
  const gltf=useGLTF(characterUrl(variant)),root=useRef<THREE.Group>(null);
  const selected=useLab(s=>s.selected===p.id);
  const rig=useMemo(()=>{const o=clone(gltf.scene);o.traverse(m=>{if(m instanceof THREE.Mesh){m.castShadow=true;m.frustumCulled=false;}});return o;},[gltf.scene]);
  const mixer=useMemo(()=>new THREE.AnimationMixer(rig),[rig]);
  const actions=useMemo(()=>Object.fromEntries(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)])),[gltf.animations,mixer]);
  const active=useRef('');
  useEffect(()=>()=>{mixer.stopAllAction();mixer.uncacheRoot(rig);},[mixer,rig]);
  useFrame(()=>{
    if(!root.current)return;const t=useLab.getState().time;
    root.current.visible=!(a.release!==undefined&&t>=a.release);
    const pos=replayPositionAt(a,t),ahead=replayPositionAt(a,t+.15);
    root.current.position.set(pos.x,.025,pos.z);
    const walking=t>a.depart&&t<a.arrive;
    if(walking)root.current.rotation.y=Math.atan2(ahead.x-pos.x,ahead.z-pos.z);
    else if(t<a.depart)root.current.rotation.y=p.ordinal<108?(Math.sign(pos.z-Math.round(pos.z/3.5)*3.5)>0?Math.PI:0):0;
    const clip=walking?'Walk':t<a.depart&&p.ordinal<108?'Seated':'Idle';
    if(active.current!==clip){mixer.stopAllAction();actions[clip]?.reset().play();active.current=clip;}
    mixer.setTime(t*(walking?p.walkSpeed:1)+p.ordinal*.173);
  });
  return <group ref={root} onClick={e=>{e.stopPropagation();useLab.setState({selected:p.id});}} onPointerOver={e=>{e.stopPropagation();document.body.style.cursor='pointer';}} onPointerOut={()=>document.body.style.cursor='auto'}><primitive object={rig}/>
    <RoleMarker role={p.role} selected={selected}/>
    {(a.risky||a.allergyMismatch)&&<mesh rotation-x={-Math.PI/2} position-y={.035}><ringGeometry args={[.49,.54,24]}/><meshBasicMaterial color={a.allergyMismatch?'#b660d4':'#ee7954'} transparent opacity={.8}/></mesh>}
    {selected&&<Html position={[0,2.45,0]} center zIndexRange={[25,10]}><div className="person-label"><RoleDot role={p.role}/><b>{p.name}</b><span>{p.id} · {roleNames[p.role]}</span></div></Html>}
  </group>;
}
function HazardZone(){
  const replay=useLab(s=>s.replay)!,c=replay.world.conditions;
  const ring=useRef<THREE.Mesh>(null);
  const color=c.hazard==='security'?'#b764d6':'#ee7142';
  useFrame(()=>{if(ring.current){const phase=useLab.getState().time;ring.current.scale.setScalar(1+Math.sin(phase*2)*.045);}});
  if(c.hazard!=='fire'&&c.hazard!=='security')return null;
  return <group position={[c.hazardPoint.x,0,c.hazardPoint.z]}>
    <mesh rotation-x={-Math.PI/2} position-y={.035}><circleGeometry args={[c.radius,48]}/><meshBasicMaterial color={color} transparent opacity={.18} depthWrite={false}/></mesh>
    <mesh ref={ring} rotation-x={-Math.PI/2} position-y={.055}><ringGeometry args={[c.radius-.06,c.radius+.04,64]}/><meshBasicMaterial color={color} transparent opacity={.85} depthWrite={false}/></mesh>
    <mesh position-y={1}><cylinderGeometry args={[c.radius,c.radius,2,48,1,true]}/><meshBasicMaterial color={color} transparent opacity={.075} side={THREE.DoubleSide} depthWrite={false}/></mesh>
    <Html position={[0,2.5,0]} center zIndexRange={[24,0]}><div className="hazard-label" style={{borderColor:color}}><i style={{background:color}}/>{hazardNames[c.hazard]}<small>실험 가정</small></div></Html>
  </group>;
}
export function ReplayScene(){
  const replay=useLab(s=>s.replay)!,selected=useLab(s=>s.selected);
  const showRoutes=useUI(s=>s.routes);
  const selectedAgent=replay.agents.find(a=>a.persona.id===selected);
  const routes=useMemo(()=>replay.agents.filter(a=>a.length>0).filter((_,i)=>i%15===0),[replay]);
  useFrame((_,dt)=>useLab.getState().advance(dt),-2);
  return <group><HazardZone/><ReplayHeatmap/>{replay.agents.map(a=><ReplayAvatar key={`${replay.world.index}-${replay.variant}-${a.persona.id}`} agent={a}/>)}
    {showRoutes&&(selectedAgent?[selectedAgent]:routes).filter(a=>a.path.length>1).map(a=><Line key={a.persona.id} points={a.path.map(p=>[p.x,.055,p.z])} color={a.risky?'#dd6a44':'#83b944'} lineWidth={selectedAgent?3:1.5} transparent opacity={selectedAgent?.9:.35} dashed dashSize={.3} gapSize={.15}/>)}</group>;
}

function ReplayHeatmap(){
  const enabled=useUI(s=>s.heatmap),replay=useLab(s=>s.replay)!;
  const mesh=useRef<THREE.InstancedMesh>(null),last=useRef(-1);
  const dummy=useMemo(()=>new THREE.Object3D(),[]),color=useMemo(()=>new THREE.Color(),[]);
  useEffect(()=>{last.current=-1;},[replay]);
  useFrame(()=>{
    const time=useLab.getState().time;
    if(!enabled||!mesh.current||Math.abs(time-last.current)<.2)return;
    last.current=time;
    const positions=replay.agents.filter(a=>a.release===undefined||time<a.release).map(a=>replayPositionAt(a,time));
    let index=0;
    for(let x=-13.5;x<=13.5;x++)for(let z=-6.25;z<=6.75;z++){
      const count=positions.filter(p=>Math.hypot(p.x-x,p.z-z)<1.55).length;
      dummy.position.set(x,.025,z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(count?1:.001);dummy.updateMatrix();
      mesh.current.setMatrixAt(index,dummy.matrix);color.set(count>5?'#e77643':count>2?'#dfc25e':'#55c19b');mesh.current.setColorAt(index++,color);
    }
    mesh.current.instanceMatrix.needsUpdate=true;if(mesh.current.instanceColor)mesh.current.instanceColor.needsUpdate=true;
  });
  return <instancedMesh ref={mesh} visible={enabled} args={[undefined,undefined,392]} frustumCulled={false}><circleGeometry args={[.65,12]}/><meshBasicMaterial transparent opacity={.25} depthWrite={false}/></instancedMesh>;
}
