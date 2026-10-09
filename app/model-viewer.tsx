'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export default function ModelViewer({buffer}:{buffer:ArrayBuffer}) {
 const host=useRef<HTMLDivElement>(null); const [error,setError]=useState(''); const [clips,setClips]=useState<string[]>([]); const [active,setActive]=useState(''); const select=useRef<(name:string)=>void>(()=>{});
 useEffect(()=>{ if(!host.current)return; let stopped=false,frame=0; let renderer:THREE.WebGLRenderer|undefined; const el=host.current; let controls:OrbitControls|undefined; let observer:ResizeObserver|undefined; const scene=new THREE.Scene(); setError('');setClips([]);setActive('');
 try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x181c20);renderer.outputColorSpace=THREE.SRGBColorSpace;el.appendChild(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(40,1,.01,1000);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
 scene.add(new THREE.HemisphereLight(0xffffff,0x657080,2.5)); const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,5,4);scene.add(key);const fill=new THREE.DirectionalLight(0x9fbcff,2);fill.position.set(-3,2,-3);scene.add(fill);
 const grid=new THREE.GridHelper(8,16,0x4a5158,0x30363c);scene.add(grid);let mixer:THREE.AnimationMixer|undefined;const clock=new THREE.Clock();
 new GLTFLoader().parse(buffer,'',g=>{if(stopped)return;const model=g.scene;scene.add(model);const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());model.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));const scale=Math.max(size.x,size.y,size.z,.01);grid.scale.setScalar(scale/2);camera.position.set(scale*1.1,scale*.75,scale*1.8);controls!.target.set(0,size.y*.48,0);controls!.update();mixer=new THREE.AnimationMixer(model);setClips(g.animations.map(c=>c.name));select.current=name=>{mixer!.stopAllAction();if(name){const clip=g.animations.find(c=>c.name===name);if(clip)mixer!.clipAction(clip).play();}};},()=>setError('GLB를 열지 못했습니다. 파일 형식과 텍스처를 확인해 주세요.'));
 const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer!.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};observer=new ResizeObserver(resize);observer.observe(el);resize();
 const animate=()=>{if(stopped)return;frame=requestAnimationFrame(animate);mixer?.update(clock.getDelta());controls?.update();renderer!.render(scene,camera);};animate();
 }catch{setError('이 브라우저에서 WebGL을 사용할 수 없습니다. GLB 파일을 내려받아 확인해 주세요.');}
 return()=>{stopped=true;cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();scene.traverse((o:any)=>{o.geometry?.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.filter(Boolean).forEach((m:any)=>{Object.values(m).forEach((v:any)=>{if(v?.isTexture)v.dispose();});m.dispose();});});renderer?.dispose();renderer?.domElement.remove();};
 },[buffer]);
 return <div className="model-view"><div ref={host} className="webgl-host"/>{error&&<div className="viewer-error">{error}</div>}<div className="viewer-controls"><span>드래그: 회전 · 휠: 확대</span>{clips.length>0&&<select aria-label="애니메이션" value={active} onChange={e=>{setActive(e.target.value);select.current(e.target.value);}}><option value="">기본 자세</option>{clips.map(c=><option key={c}>{c}</option>)}</select>}</div></div>;
}
