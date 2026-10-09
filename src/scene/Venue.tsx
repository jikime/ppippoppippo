import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { EXITS } from '../simulation/layout';
import { useUI } from '../state';
import { world } from '../simulation/world';
import { AGENDA } from '../simulation/agenda';
import { codeTexture, makeFurniture, signTexture } from './assets';
import { useLab } from '../lab/store';

function Box({position,size,color,roughness=.8}: {position:[number,number,number];size:[number,number,number];color:string;roughness?:number}){
  return <mesh position={position} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={roughness}/></mesh>;
}
function Plant({x,z}:{x:number;z:number}){
  return <group position={[x,0,z]}>
    <mesh position-y={.23} castShadow><cylinderGeometry args={[.25,.18,.44,12]}/><meshStandardMaterial color="#dcd8cd"/></mesh>
    <mesh position-y={.68}><cylinderGeometry args={[.025,.04,.8,6]}/><meshStandardMaterial color="#86795c"/></mesh>
    {[[-.15,.85,.1],[.13,1.05,-.06],[-.04,1.22,0],[.22,.77,.12]].map((p,i)=><mesh key={i} position={p as [number,number,number]} scale={[.25,.38,.15]} rotation-z={i%2?.5:-.5} castShadow><sphereGeometry args={[1,7,5]}/><meshStandardMaterial color={['#628876','#456f58','#83a58c'][i%3]}/></mesh>)}
  </group>;
}
function Screen({x,index}:{x:number;index:number}){
  const scenario=useUI(s=>s.data.scenario),guidance=useUI(s=>s.data.guidance),phaseId=useUI(s=>s.data.agenda?.phaseId),segment=useUI(s=>s.data.agenda?.segment);
  const phase=AGENDA.find(p=>p.id===phaseId);
  const texture=useMemo(()=>signTexture(phase?(segment==='photo'?'One team.\nOne memory.':phase.screen):scenario==='normal'?(index===1?'Build what’s\nnext.':'Ideas into\nimpact.'):(guidance?'Follow the\ngreen path.':'Take a\nbreather.'),scenario==='normal'?'AWS BUILDER DAY 2026  /  HACKATHON':'CROWDGUARD  /  VENUE GUIDANCE',index===1),[index,scenario,guidance,phase,segment]);
  return <group position={[x,2.15,-6.76]}>
    <Box position={[0,0,-.055]} size={[4.35,2.24,.08]} color="#303b36"/>
    <mesh position-z={.005}><planeGeometry args={[4.20,2.1]}/><meshStandardMaterial map={texture} emissive="#e4ecd6" emissiveIntensity={.16} roughness={.9}/></mesh>
    <Box position={[0,1.14,-.03]} size={[4.5,.14,.15]} color="#eeeae0"/>
  </group>;
}
function Door({index}:{index:number}){
  const def=EXITS[index];const liveOpen=useUI(s=>s.data.exits[index]?.open??true),lab=useUI(s=>s.panel==='lab'),closed=useLab(s=>s.replay?.world.conditions.closedExit);
  const open=lab&&closed!==undefined?closed!==index:liveOpen;
  const hinge=useRef<THREE.Group>(null);
  useFrame((_,dt)=>{if(hinge.current)hinge.current.rotation.y=THREE.MathUtils.damp(hinge.current.rotation.y,open?-Math.PI*.46:0,5,dt);});
  return <group position={[def.x,0,7]}>
    <Box position={[-1.02,1.48,0]} size={[.075,2.96,.13]} color="#52645e"/>
    <Box position={[1.02,1.48,0]} size={[.075,2.96,.13]} color="#52645e"/>
    <Box position={[0,2.94,0]} size={[2.13,.09,.13]} color="#52645e"/>
    <group ref={hinge} position={[-.97,0,0]}>
      <Box position={[.95,1.43,0]} size={[1.90,2.84,.045]} color="#536964" roughness={.35}/>
      <mesh position={[.95,1.78,-.026]}><planeGeometry args={[1.58,1.5]}/><meshStandardMaterial color="#adc8bf" transparent opacity={.44} roughness={.2} metalness={.1}/></mesh>
      <Box position={[1.73,1.08,-.075]} size={[.035,.34,.065]} color="#d4ddd8" roughness={.18}/>
    </group>
    <mesh position={[0,3.08,0]}><boxGeometry args={[.55,.19,.12]}/><meshStandardMaterial color={open?'#65c496':'#df9162'} emissive={open?'#38a677':'#b94b25'} emissiveIntensity={4}/></mesh>
    {!open&&<mesh position={[0,.026,-.65]} rotation-x={-Math.PI/2}><ringGeometry args={[1.03,1.13,48]}/><meshBasicMaterial color="#d79650" transparent opacity={.8} depthWrite={false}/></mesh>}
    <Html position={[0,.04,1.45]} center zIndexRange={[15,0]}><button className={`door-label ${open?'':'closed'}`} disabled={lab} onClick={()=>world.toggleExit(def.id)} title={lab?'실험에 기록된 출입구 상태':`${def.id} 출입구 ${open?'통제':'개방'}`}><span className="status-dot"/>{def.id} <span>{open?'OPEN':'CLOSED'}</span></button></Html>
  </group>;
}
export function Venue(){
  const walls=useUI(s=>s.walls),revision=useUI(s=>s.data.revision);const furniture=useMemo(makeFurniture,[]);const screen=useMemo(codeTexture,[]);
  const floorText=useMemo(()=>signTexture('CROWDGUARD','PEOPLE FIRST. ALWAYS.',true),[]);
  return <group>
    <RoundedBox args={[30.4,.52,17.7]} radius={.16} smoothness={2} position={[0,-.37,.65]} receiveShadow><meshStandardMaterial color="#cdd4d0" roughness={.8}/></RoundedBox>
    <RoundedBox args={[29.85,.10,17.18]} radius={.07} smoothness={2} position={[0,-.055,.65]} receiveShadow><meshStandardMaterial color="#dfdfd5" roughness={.95}/></RoundedBox>
    <Box position={[0,-.23,9.46]} size={[29.4,.10,.06]} color="#6a9c87"/>
    {[-9.75,0,9.75].map((x,i)=><mesh key={x} position={[x,.004,-.2]} rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[9.25,12.9]}/><meshStandardMaterial color={i===1?'#d0d2c7':'#d5d6cc'} roughness={1}/></mesh>)}
    {Array.from({length:30},(_,i)=><Box key={i} position={[-14.25+i*.98,.009,0]} size={[.012,.002,13.6]} color="#c7cbc2"/>)}
    {[-5.8,-1.75,1.75,5.55].map(z=><Box key={z} position={[0,.013,z]} size={[28,.008,.045]} color="#eeeae0"/>)}
    <Box position={[0,1.7,-7]} size={[29,3.4,.19]} color="#e6e4dc"/>
    {Array.from({length:15},(_,i)=><Box key={i} position={[-14+i*2,1.65,-6.885]} size={[.014,3.25,.012]} color="#c9ccc3"/>)}
    <Box position={[0,.14,-6.865]} size={[29,.25,.035]} color="#c3c7bb"/>
    {[-8,0,8].map((x,i)=><Screen key={x} x={x} index={i}/>)}
    {[-4,4].map(x=><group key={x} position={[x,1.85,-6.8]}><Box position={[0,0,0]} size={[1.6,1.5,.04]} color="#b6c1b8"/><Box position={[0,0,.025]} size={[1.5,1.4,.012]} color="#f2f5ef"/><Box position={[0,-.75,.04]} size={[1.6,.025,.08]} color="#849d8e"/></group>)}
    <group position={[-13.1,0,-6.0]}><Box position={[0,.58,0]} size={[.85,1.16,.36]} color="#f1f2e9"/><Box position={[0,1.19,.04]} size={[1.0,.07,.53]} color="#e9ede1"/><Box position={[0,.74,.19]} size={[.32,.14,.015]} color="#688674"/></group>
    {furniture.map(({geometry,color})=><mesh key={color} geometry={geometry} castShadow receiveShadow>{color==='screen'?<meshStandardMaterial map={screen} emissiveMap={screen} emissive="#ffffff" emissiveIntensity={.35}/>:<meshStandardMaterial color={color} roughness={color==='#a0aaa6'?.4:.82}/>}</mesh>)}
    {walls&&<group>
      <Box position={[-14.48,.55,0]} size={[.16,1.1,14]} color="#deded4"/>
      <Box position={[14.48,.5,0]} size={[.13,1,14]} color="#bccbc0"/>
      {[-5.4,-1.8,1.8,5.4].map(z=><group key={z} position={[14.42,0,z]}><Box position={[0,.7,0]} size={[.06,1.4,.07]} color="#71887d"/><mesh position={[0,.69,1.75]} rotation-y={Math.PI/2}><planeGeometry args={[3.4,1.35]}/><meshStandardMaterial color="#aed1c1" transparent opacity={.17} side={THREE.DoubleSide} roughness={.25}/></mesh></group>)}
      {[-6,6].map(x=><group key={x}><mesh position={[x,.58,7]}><boxGeometry args={[9.75,1.16,.035]}/><meshStandardMaterial color="#b3cfc5" transparent opacity={.26} roughness={.26}/></mesh>{[-4.7,0,4.7].map(dx=><Box key={dx} position={[x+dx,.64,7]} size={[.035,1.3,.05]} color="#84998d"/>)}</group>)}
    </group>}
    <EventStations/>
    {EXITS.map((_,i)=><Door key={`${i}-${revision}`} index={i}/>)}
    {[-13.5,13.5].flatMap(x=>[-5.9,4.7].map(z=><Plant key={`${x}-${z}`} x={x} z={z}/>))}
    {[-13.6,13.6].map(x=><group key={x} position={[x,0,1.2]}><mesh position-y={.49} castShadow><cylinderGeometry args={[.26,.24,.95,16]}/><meshStandardMaterial color="#f0f1e9"/></mesh><mesh position-y={.93}><torusGeometry args={[.23,.015,5,24]}/><meshStandardMaterial color="#89dcc6" emissive="#66aa98" emissiveIntensity={.6}/></mesh></group>)}
    {[-10,0,10].map(x=><group key={x} position={[x,3.65,-5.8]}><Box position={[0,0,0]} size={[5.0,.045,.07]} color="#fbf9e9"/><Box position={[0,.08,0]} size={[5.0,.12,.045]} color="#d7dbcf"/></group>)}
    {[-9.5,0,9.5].map((x,i)=><Html key={x} position={[x,3.9,-7]} center zIndexRange={[12,0]}><div className="zone-pin"><span>0{i+1}</span>{['BUILD ZONE','COLLAB ZONE','CREATE ZONE'][i]}</div></Html>)}
    <mesh position={[0,-.30,9.51]}><planeGeometry args={[3.4,.32]}/><meshBasicMaterial map={floorText}/></mesh>
  </group>;
}

function EventStations(){
  const phase=useUI(s=>s.data.agenda?.phaseId),segment=useUI(s=>s.data.agenda?.segment);
  const meal=phase==='lunch'||phase==='tracks';
  return <group>
    {[-14,14].flatMap(x=>[-3.8,-.8,2.2].map((z,i)=><group key={`${x}-${z}`} position={[x,0,z]}>
      <Box position={[0,.45,0]} size={[.5,.9,1.35]} color="#c7d2bd"/>
      <Box position={[0,.94,0]} size={[.62,.09,1.5]} color="#f7f3e8"/>
      {meal&&[-.4,0,.4].map((offset,j)=><group key={offset} position={[0,1.01,offset]}><mesh><cylinderGeometry args={[.15,.13,.05,12]}/><meshStandardMaterial color="#f9f5e8"/></mesh><mesh position-y={.055}><sphereGeometry args={[.10,8,5]}/><meshStandardMaterial color={['#dba35b','#83a865','#cd8766'][j]}/></mesh></group>)}
      {meal&&i===1&&<Html position={[0,1.8,0]} center zIndexRange={[9,0]}><div className="zone-pin">SELF SERVICE</div></Html>}
    </group>))}
    {phase==='closing'&&segment==='awards'&&<group position={[0,0,-6.4]}>
      <Box position={[0,.6,0]} size={[.7,1.2,.5]} color="#a8bfa0"/>
      <mesh position-y={1.28}><cylinderGeometry args={[.19,.24,.14,12]}/><meshStandardMaterial color="#c89845" metalness={.65} roughness={.3}/></mesh>
      <mesh position-y={1.55}><cylinderGeometry args={[.24,.09,.43,12]}/><meshStandardMaterial color="#e9c068" metalness={.7} roughness={.25}/></mesh>
    </group>}
    {phase==='closing'&&segment==='photo'&&<group position={[0,0,5.9]}>
      <mesh position-y={.65}><cylinderGeometry args={[.025,.04,1.3,8]}/><meshStandardMaterial color="#435f51"/></mesh>
      <Box position={[0,1.38,0]} size={[.35,.25,.23]} color="#364e45"/>
      <mesh position={[0,1.38,-.14]} rotation-x={Math.PI/2}><cylinderGeometry args={[.08,.08,.11,12]}/><meshStandardMaterial color="#172c26"/></mesh>
    </group>}
  </group>;
}
