import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { Person } from '../simulation/world';
import { world } from '../simulation/world';
import { useUI } from '../state';
import { roleNames } from '../simulation/layout';

const bakedSeat=(p:Person)=>p.sitting&&['working','listening','preparing','submitting'].includes(p.state);
const variants=['participant-teal','participant-navy','participant-cream','operator','judge','host'];
variants.forEach(v=>useGLTF.preload(`/models/${v}.glb`));
function Avatar({person:p}:{person:Person}){
  const gltf=useGLTF(`/models/${p.variant}.glb`);
  const selected=useUI(s=>s.selected===p.id);const select=useUI(s=>s.select);
  const root=useRef<THREE.Group>(null);
  const rig=useMemo(()=>{const obj=clone(gltf.scene);obj.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});return obj;},[gltf.scene]);
  const mixer=useMemo(()=>new THREE.AnimationMixer(rig),[rig]);
  const actions=useMemo(()=>Object.fromEntries(gltf.animations.map(clip=>[clip.name,mixer.clipAction(clip)])),[gltf.animations,mixer]);
  const active=useRef('');const heading=useRef(p.heading);
  useEffect(()=>()=>{mixer.stopAllAction();mixer.uncacheRoot(rig);},[mixer,rig]);
  useFrame((_,dt)=>{
    if(!root.current)return;
    const distantSeated=bakedSeat(p)&&_.camera.position.distanceTo(new THREE.Vector3(p.position.x,1,p.position.z))>22;
    root.current.visible=p.state!=='outside'&&p.state!=='notArrived'&&!distantSeated;
    const alpha=world.running?world.alpha:1;
    root.current.position.set(THREE.MathUtils.lerp(p.previous.x,p.position.x,alpha),.018,THREE.MathUtils.lerp(p.previous.z,p.position.z,alpha));
    let diff=((p.heading-heading.current+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
    if(world.running)heading.current+=diff*Math.min(1,dt*10);root.current.rotation.y=heading.current;
    const clip=p.speed>.12?'Walk':p.sitting?(p.state==='eating'?'Eat':p.state==='applauding'?'Applaud':p.state==='listening'?'Listen':'Seated'):p.state==='guiding'?'Guide':['visiting','presenting','networking','judging','checking','cleaning','serving'].includes(p.state)?'Talk':'Idle';
    if(active.current!==clip){const prev=actions[active.current];const next=actions[clip];next.reset();next.time=(p.ordinal*.173)%next.getClip().duration;next.play();if(prev)prev.crossFadeTo(next,.35,false);else mixer.update(0);active.current=clip;}
    if(actions.Walk)actions.Walk.timeScale=Math.max(.3,p.speed*1.15);
    if(world.running&&!distantSeated)mixer.update(Math.min(dt,.1)*world.speed);
  },-1);
  return <group ref={root} onClick={e=>{e.stopPropagation();select(p.id);}} onPointerOver={e=>{e.stopPropagation();document.body.style.cursor='pointer';}} onPointerOut={()=>{document.body.style.cursor='auto';}}>
    <primitive object={rig}/>
    {(selected||p.role==='operator')&&<mesh rotation-x={-Math.PI/2} position-y={.015}><ringGeometry args={[selected?.36:.25,selected?.41:.285,32]}/><meshBasicMaterial color={selected?'#e6a347':'#40b590'} transparent opacity={.85} depthWrite={false}/></mesh>}
    {selected&&<Html position={[0,2.08,0]} center zIndexRange={[25,10]}><div className="person-label"><span className={`role-dot ${p.role}`}/><b>{p.id}</b><span>{roleNames[p.role]}</span></div></Html>}
  </group>;
}

// At overview distance, seated figures share a baked pose in three GPU draws.
// Moving or nearby people always use their full skeleton and animation mixer.
function SeatedInstances({variant}:{variant:string}){
  const gltf=useGLTF(`/models/${variant}.glb`);const instance=useRef<THREE.InstancedMesh>(null);
  const people=world.people.filter(p=>p.variant===variant);const dummy=useMemo(()=>new THREE.Object3D(),[]);
  const {geometry,material}=useMemo(()=>{
    const rig=clone(gltf.scene);const mixer=new THREE.AnimationMixer(rig);const action=mixer.clipAction(gltf.animations.find(c=>c.name==='Seated')!);action.play();mixer.setTime(.3);rig.updateMatrixWorld(true);
    let mesh:THREE.SkinnedMesh|undefined;rig.traverse(o=>{if(o instanceof THREE.SkinnedMesh)mesh=o;});
    const body=mesh!;body.skeleton.update();const geo=body.geometry.clone();const vertices=new Float32Array(geo.attributes.position.count*3);const point=new THREE.Vector3();
    for(let i=0;i<geo.attributes.position.count;i++){point.fromBufferAttribute(geo.attributes.position,i);body.applyBoneTransform(i,point);point.applyMatrix4(body.matrixWorld);point.toArray(vertices,i*3);}
    geo.setAttribute('position',new THREE.BufferAttribute(vertices,3));geo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(vertices.length),3));geo.computeVertexNormals();geo.computeBoundingSphere();
    geo.deleteAttribute('skinIndex');geo.deleteAttribute('skinWeight');mixer.stopAllAction();mixer.uncacheRoot(rig);
    return{geometry:geo,material:(body.material as THREE.MeshStandardMaterial).clone()};
  },[gltf]);
  useFrame(({camera})=>{
    if(!instance.current)return;
    for(let i=0;i<people.length;i++){
      const p=people[i],show=bakedSeat(p)&&Math.hypot(camera.position.x-p.position.x,camera.position.y-1,camera.position.z-p.position.z)>22;
      dummy.position.set(p.position.x,.018,p.position.z);dummy.rotation.set(0,p.heading,0);dummy.scale.setScalar(show?1:0);dummy.updateMatrix();instance.current.setMatrixAt(i,dummy.matrix);
    }
    instance.current.instanceMatrix.needsUpdate=true;instance.current.boundingSphere=new THREE.Sphere(new THREE.Vector3(),30);
  },-1);
  return <instancedMesh ref={instance} args={[geometry,material,people.length]} castShadow receiveShadow frustumCulled={false} onClick={e=>{e.stopPropagation();if(e.instanceId!==undefined)useUI.getState().select(people[e.instanceId].id);}} onPointerOver={e=>{e.stopPropagation();document.body.style.cursor='pointer';}} onPointerOut={()=>{document.body.style.cursor='auto';}}/>;
}
export function People(){const revision=useUI(s=>s.data.revision);return <group key={revision}>{world.people.map(p=><Avatar key={p.id} person={p}/>)}{variants.slice(0,3).map(variant=><SeatedInstances key={variant} variant={variant}/>)}</group>;}
