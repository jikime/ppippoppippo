import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import type { OrbitControls as Controls } from 'three-stdlib';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Venue } from './Venue';
import { People } from './People';
import { useUI } from '../state';
import { world } from '../simulation/world';
import { EXITS } from '../simulation/layout';
import { useLab } from '../lab/store';
import { ReplayScene } from '../lab/ReplayScene';

function Environment(){
  const {gl,scene}=useThree();
  useEffect(()=>{const pmrem=new THREE.PMREMGenerator(gl);const room=new RoomEnvironment();const target=pmrem.fromScene(room,.04);scene.environment=target.texture;scene.environmentIntensity=.35;room.dispose();pmrem.dispose();return()=>{scene.environment=null;target.dispose();};},[gl,scene]);
  return null;
}
function Simulation(){const state=useThree();useEffect(()=>{if(import.meta.env.DEV)(window as unknown as {venueScene:typeof state}).venueScene=state;},[state]);useFrame((_,dt)=>{if(useUI.getState().panel!=='lab')world.advance(dt);},-3);return null;}
function CameraRig(){
  const controls=useRef<Controls>(null);const {camera,size}=useThree();
  const cinema=useUI(s=>s.cinema),panelVisible=useUI(s=>s.panelVisible);
  const analytics=useUI(s=>s.panel==='analytics');
  const desktopHud=size.width>760&&!cinema&&!analytics;
  const fit=Math.max(1,1.6/(size.width/size.height))*(desktopHud?1.27:1);
  const mode=useUI(s=>s.camera),revision=useUI(s=>s.cameraRevision),selected=useUI(s=>s.selected);
  const manualFollowExit=useRef(false);
  const story=useUI(s=>s.data.story),step=useUI(s=>s.data.storyStep);const automatic=useRef(false);
  const moving=useRef(true);const goal=useRef(new THREE.Vector3(22,23,28));const target=useRef(new THREE.Vector3(0,-.3,2.2));
  useEffect(()=>{
    // Keep a full-viewport render target, framing the venue in the space between the HUD boards.
    const perspective=camera as THREE.PerspectiveCamera;
    if(desktopHud)perspective.setViewOffset(size.width,size.height,panelVisible?Math.min(160,size.width*.085):0,size.height*.075,size.width,size.height);
    else perspective.clearViewOffset();
    return()=>perspective.clearViewOffset();
  },[camera,desktopHud,panelVisible,size.width,size.height]);
  useEffect(()=>{
    automatic.current=false;
    if(manualFollowExit.current){manualFollowExit.current=false;return;}
    moving.current=true;
    if(mode==='overview'){goal.current.set(22,23,28).multiplyScalar(fit);target.current.set(0,-.3,2.2);}
    if(mode==='top'){goal.current.set(0,30*fit,.05);target.current.set(0,0,.5);}
    if(mode==='floor'){goal.current.set(12.8,3.5,6.0);target.current.set(-4,1.1,-2);}
  },[mode,revision,fit]);
  useEffect(()=>{automatic.current=story;},[story]);
  useEffect(()=>{
    if(!story||!automatic.current)return;moving.current=true;
    if(step===2){goal.current.set(9,14,22);target.current.set(0,.1,2.3);}
    else if(step===3){goal.current.set(21,24,26).multiplyScalar(fit);target.current.set(0,-.3,2.2);}
    else{goal.current.set(22,23,28).multiplyScalar(fit);target.current.set(0,-.3,2.2);}
  },[story,step,fit]);
  useFrame((_,dt)=>{
    if(!controls.current)return;
    const person=world.people.find(p=>p.id===selected);
    if(mode==='follow'&&person&&person.state!=='outside'){
      target.current.set(person.position.x,1,person.position.z);goal.current.set(person.position.x+3.4,4,person.position.z+4.2);moving.current=true;
    }
    if(moving.current){
      const blend=1-Math.exp(-dt*3.5);camera.position.lerp(goal.current,blend);controls.current.target.lerp(target.current,blend);controls.current.update();
      if(mode!=='follow'&&camera.position.distanceTo(goal.current)<.02)moving.current=false;
    }
  });
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.07} minDistance={3} maxDistance={Math.max(95,53*fit)} maxPolarAngle={Math.PI*.49} onStart={()=>{moving.current=false;automatic.current=false;if(mode==='follow'){manualFollowExit.current=true;useUI.setState({camera:'overview'});}}}/>;
}
function AdaptiveResolution(){
  const measure=useRef({seconds:0,frames:0,cooldown:4});
  useFrame((_,dt)=>{const m=measure.current;m.cooldown-=dt;if(m.cooldown>0)return;m.seconds+=dt;m.frames++;if(m.seconds<2)return;const fps=m.frames/m.seconds,dpr=useUI.getState().renderDpr;if(fps<43&&dpr>1)useUI.setState({renderDpr:Math.max(1,dpr-.25)});m.seconds=0;m.frames=0;m.cooldown=4;});
  return null;
}

function FlowPath({points,color}:{points:[number,number,number][];color:string}){
  const arrows=useRef<THREE.InstancedMesh>(null);const path=useMemo(()=>new THREE.CurvePath<THREE.Vector3>(),[]);
  useMemo(()=>{path.curves=[];for(let i=1;i<points.length;i++)path.add(new THREE.LineCurve3(new THREE.Vector3(...points[i-1]),new THREE.Vector3(...points[i])));path.updateArcLengths();},[path,points]);
  const dummy=useMemo(()=>new THREE.Object3D(),[]);
  useFrame(()=>{
    if(!arrows.current)return;
    for(let i=0;i<10;i++){const u=(i/10+world.time*.035)%1;const p=path.getPoint(u);const next=path.getPoint(Math.min(.9999,u+.005));dummy.position.copy(p);dummy.position.y=.045;dummy.rotation.set(-Math.PI/2,0,-Math.atan2(next.x-p.x,next.z-p.z));dummy.scale.set(.17,.24,1);dummy.updateMatrix();arrows.current.setMatrixAt(i,dummy.matrix);}arrows.current.instanceMatrix.needsUpdate=true;
  });
  const geometry=useMemo(()=>{const shape=new THREE.Shape();shape.moveTo(0,.6);shape.lineTo(-.55,-.5);shape.lineTo(0,-.15);shape.lineTo(.55,-.5);shape.closePath();return new THREE.ShapeGeometry(shape);},[]);
  return <group><Line points={points} color={color} lineWidth={1.1} transparent opacity={.32}/><instancedMesh ref={arrows} args={[geometry,undefined,10]} frustumCulled={false}><meshBasicMaterial color={color} transparent opacity={.8} side={THREE.DoubleSide}/></instancedMesh></group>;
}
function Routes(){
  const enabled=useUI(s=>s.routes),open=useUI(s=>s.data.exits.map(e=>e.open?'1':'0').join(''));
  const paths=useMemo(()=>EXITS.map(e=>({id:e.id,points:[[e.x,0.04,-5.7],[e.x,0.04,5.65],[e.x,0.04,8.3]] as [number,number,number][]})),[]);
  const selected=useUI(s=>s.selected),time=useUI(s=>Math.floor(s.data.time));
  const selectedPath=useMemo(()=>{const p=world.people.find(x=>x.id===selected);return p&&p.goal?world.navigation.path(p.position,p.goal).map(v=>[v.x,.09,v.z] as [number,number,number]):[];},[selected,time]);
  if(!enabled)return null;
  return <group>{paths.map((p,i)=>open[i]!=='0'&&<FlowPath key={p.id} points={p.points} color="#319d77"/>)}{selectedPath.length>1&&<Line points={selectedPath} color="#e7a347" lineWidth={3} dashed dashSize={.3} gapSize={.16}/>}</group>;
}
function Heatmap(){
  const enabled=useUI(s=>s.heatmap);const mesh=useRef<THREE.InstancedMesh>(null);const last=useRef(-1);const dummy=useMemo(()=>new THREE.Object3D(),[]);const color=useMemo(()=>new THREE.Color(),[]);
  useFrame(()=>{
    if(!enabled||!mesh.current||world.time-last.current<.5&&world.time>=last.current)return;last.current=world.time;
    let index=0;
    for(let x=-13.5;x<=13.5;x+=1)for(let z=-6.25;z<=6.75;z+=1){
      const nearby=world.people.filter(p=>p.state!=='outside'&&p.state!=='notArrived'&&Math.hypot(p.position.x-x,p.position.z-z)<1.55).length;
      color.set(nearby>5?'#e77643':nearby>2?'#dfc25e':'#55c19b');dummy.position.set(x,.024,z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(nearby?1:.01);dummy.updateMatrix();mesh.current.setMatrixAt(index,dummy.matrix);mesh.current.setColorAt(index,color);index++;
    }
    mesh.current.instanceMatrix.needsUpdate=true;if(mesh.current.instanceColor)mesh.current.instanceColor.needsUpdate=true;
  });
  return <instancedMesh visible={enabled} ref={mesh} args={[undefined,undefined,392]} frustumCulled={false}><circleGeometry args={[.65,12]}/><meshBasicMaterial transparent opacity={.28} depthWrite={false}/></instancedMesh>;
}
function VirtualCamera(){
  const enabled=useUI(s=>s.cctv),night=useUI(s=>s.night),walls=useUI(s=>s.walls);const resources=useMemo(()=>{
    const camera=new THREE.PerspectiveCamera(68,16/9,.15,90);camera.position.set(13.3,3.5,6.5);camera.lookAt(-4,.8,-2);
    const target=new THREE.WebGLRenderTarget(384,216,{depthBuffer:true});target.texture.colorSpace=THREE.SRGBColorSpace;
    return{camera,target,buffer:new Uint8Array(384*216*4),last:-1,key:'',canvas:null as HTMLCanvasElement|null};
  },[]);
  useEffect(()=>()=>resources.target.dispose(),[resources]);
  useFrame(({gl,scene})=>{
    if(!enabled)return;
    const canvas=document.getElementById('virtual-cctv') as HTMLCanvasElement|null;
    if(!canvas||!canvas.clientWidth)return;
    const width=canvas.width,height=canvas.height;
    const key=`${canvas.dataset.camera}-${night}-${walls}-${world.revision}-${width}-${height}`;
    if(world.time-resources.last<.18&&world.time>=resources.last&&key===resources.key&&resources.canvas===canvas)return;
    resources.last=world.time;resources.key=key;resources.canvas=canvas;
    if(resources.target.width!==width||resources.target.height!==height){resources.target.setSize(width,height);resources.buffer=new Uint8Array(width*height*4);}
    if(canvas.dataset.camera==='2'){resources.camera.position.set(-13.3,3.5,-5.5);resources.camera.lookAt(4,.7,3);}else{resources.camera.position.set(13.3,3.5,6.5);resources.camera.lookAt(-4,.8,-2);}
    const old=gl.getRenderTarget(),oldShadows=gl.shadowMap.autoUpdate,oldTone=gl.toneMapping,oldBackground=scene.background;
    gl.shadowMap.autoUpdate=false;gl.toneMapping=THREE.ACESFilmicToneMapping;scene.background=new THREE.Color('#000000');
    gl.setRenderTarget(resources.target);gl.render(scene,resources.camera);gl.readRenderTargetPixels(resources.target,0,0,width,height,resources.buffer);
    gl.setRenderTarget(old);gl.shadowMap.autoUpdate=oldShadows;gl.toneMapping=oldTone;scene.background=oldBackground;
    const ctx=canvas.getContext('2d');ctx?.putImageData(new ImageData(new Uint8ClampedArray(resources.buffer),width,height),0,0);
  },-.5);
  return null;
}
function Contents(){
  const night=useUI(s=>s.night),quality=useUI(s=>s.quality);
  const lab=useUI(s=>s.panel==='lab'),replay=useLab(s=>s.replay);
  return <>
    <color attach="background" args={['#000000']}/>
    <Simulation/><Environment/><CameraRig/><AdaptiveResolution/>
    <ambientLight intensity={night?.18:.25}/><hemisphereLight args={['#e5f4ef','#8f9b82',night?.35:.65]}/>
    <directionalLight position={[-10,22,12]} intensity={night?1.1:2.1} color={night?'#b5cdd8':'#fff7df'} castShadow shadow-mapSize={quality==='high'?[2048,2048]:[1024,1024]} shadow-camera-left={-23} shadow-camera-right={23} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-normalBias={.025} shadow-bias={-.0001} shadow-radius={3}/>
    {night&&<><pointLight position={[0,4,-2]} intensity={25} color="#fff0c6" distance={22}/><pointLight position={[-9,4,-2]} intensity={18} color="#d0ecd9" distance={18}/><pointLight position={[9,4,-2]} intensity={18} color="#d0ecd9" distance={18}/></>}
    <mesh rotation-x={-Math.PI/2} position-y={-.65} receiveShadow><planeGeometry args={[200,200]}/><shadowMaterial transparent opacity={.13}/></mesh>
    <Venue/><Suspense fallback={null}>{lab&&replay?<ReplayScene/>:<People/>}</Suspense>
    {!lab&&<><Routes/><Heatmap/><VirtualCamera/></>}
    {quality==='high'&&<EffectComposer multisampling={2}><Bloom luminanceThreshold={3.2} intensity={.15} mipmapBlur/><ToneMapping mode={ToneMappingMode.ACES_FILMIC}/></EffectComposer>}
  </>;
}
export function Scene(){
  const night=useUI(s=>s.night),dpr=useUI(s=>s.renderDpr);const select=useUI(s=>s.select);
  return <div className={`scene-container ${night?'night':''}`} aria-label="AWS 행사장 인터랙티브 3D 모델">
    <Canvas shadows dpr={dpr} camera={{position:[26,28,34],fov:34,near:.1,far:260}} gl={{antialias:true,alpha:true,powerPreference:'high-performance'}} onPointerMissed={()=>{select(null);useLab.setState({selected:null});}}><Contents/></Canvas>
  </div>;
}
