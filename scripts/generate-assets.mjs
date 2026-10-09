import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

// Original, purpose-built low-poly assets. No external model or texture downloads.
globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
};
const out = new URL('../public/models/', import.meta.url);
await mkdir(out, { recursive: true });
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const variants = [
  ['participant-teal', '#467b77', '#dfad88', '#31332f'],
  ['participant-navy', '#435674', '#e5bba0', '#282b32'],
  ['participant-cream', '#e3d8bd', '#b98164', '#282224'],
  ['operator', '#24b38c', '#d6a27c', '#302c29'],
  ['judge', '#af8462', '#efd0b7', '#36302c'],
  ['host', '#9c9aca', '#b68264', '#2b272a'],
];
for (const [name, shirt, skin, hair] of variants) {
  const bones = [];
  const bone = (name, parent, x,y,z) => { const b = new THREE.Bone(); b.name = name; b.position.set(x,y,z); if(parent)parent.add(b); bones.push(b); return b; };
  const hips = bone('Hips', null,0,.83,0);
  const spine = bone('Spine', hips,0,.18,0);
  const head = bone('Head', spine,0,.43,0);
  const armL = bone('ArmL', spine,-.255,.29,0);
  const foreL = bone('ForeL', armL,0,-.29,0);
  const armR = bone('ArmR', spine,.255,.29,0);
  const foreR = bone('ForeR', armR,0,-.29,0);
  const legL = bone('LegL', hips,-.115,-.03,0);
  const shinL = bone('ShinL',legL,0,-.36,0);
  const legR = bone('LegR',hips,.115,-.03,0);
  const shinR = bone('ShinR',legR,0,-.36,0);
  hips.updateMatrixWorld(true);
  const parts = [];
  const box = (w,h,d,r=.025) => new RoundedBoxGeometry(w,h,d,1,r);
  const part = (geo, b, xyz, color) => {
    geo.translate(...xyz); geo.applyMatrix4(b.matrixWorld);
    const n = geo.attributes.position.count;
    const c = new THREE.Color(color); const colors = new Float32Array(n*3);
    const indices = new Uint16Array(n*4); const weights = new Float32Array(n*4);
    for(let i=0;i<n;i++){ colors.set([c.r,c.g,c.b],i*3); indices[i*4]=bones.indexOf(b);weights[i*4]=1; }
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geo.setAttribute('skinIndex',new THREE.BufferAttribute(indices,4));
    geo.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));
    parts.push(geo.index?geo.toNonIndexed():geo);
  };
  part(box(.39,.17,.245),hips,[0,0,0],'#334052');
  part(box(.43,.44,.27,.055),spine,[0,.16,0],shirt);
  part(box(.12,.08,.035,.01),spine,[.08,.27,.152],'#e9f4ee');
  part(box(.09,.018,.037,.004),spine,[.08,.28,.154],'#f3b768');
  part(new THREE.CylinderGeometry(.067,.07,.1,8),head,[0,-.03,0],skin);
  part(box(.31,.34,.30,.095),head,[0,.155,0],skin);
  part(box(.32,.13,.30,.05),head,[0,.305,-.015],hair);
  part(box(.055,.16,.10,.02),head,[-.144,.235,-.05],hair);
  part(box(.055,.16,.10,.02),head,[.144,.235,-.05],hair);
  part(box(.055,.065,.05,.017),head,[0,.135,.156],skin);
  for(const x of [-.068,.068]){
    part(new THREE.SphereGeometry(.017,5,4),head,[x,.185,.149],'#25302e');
    part(new THREE.SphereGeometry(.006,4,3),head,[x-.004,.189,.162],'#ffffff');
  }
  for(const [arm,fore] of [[armL,foreL],[armR,foreR]]){
    part(box(.145,.29,.17,.045),arm,[0,-.13,0],shirt);
    part(box(.10,.245,.11,.04),fore,[0,-.10,0],skin);
    part(box(.10,.09,.12,.03),fore,[0,-.23,.015],skin);
  }
  for(const [leg,shin] of [[legL,shinL],[legR,shinR]]){
    part(box(.15,.36,.19,.035),leg,[0,-.17,0],'#344252');
    part(box(.13,.42,.15,.03),shin,[0,-.19,0],'#344252');
    part(box(.16,.10,.28,.032),shin,[0,-.385,.052],'#eeeae3');
    part(box(.17,.035,.29,.01),shin,[0,-.423,.052],'#c2c5c0');
  }
  const geometry = mergeGeometries(parts,false);
  const mesh = new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83}));
  mesh.name = name;
  mesh.add(hips);
  mesh.bind(new THREE.Skeleton(bones));
  const times=[0,.25,.5,.75,1];
  const qtrack=(name, fn) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`,times, times.flatMap(t=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...fn(t))).toArray()));
  const ptrack=(fn)=>new THREE.VectorKeyframeTrack('Hips.position',times,times.flatMap(fn));
  const tau=Math.PI*2;
  const idle = new THREE.AnimationClip('Idle',1,[ptrack(t=>[0,.83+Math.sin(t*tau)*.008,0]),qtrack('Head',t=>[0,Math.sin(t*tau)*.06,0]),qtrack('ArmL',()=>[0,0,-.06]),qtrack('ArmR',()=>[0,0,.06])]);
  const walk = new THREE.AnimationClip('Walk',1,[
    ptrack(t=>[0,.83+Math.abs(Math.sin(t*tau))*.025,0]),
    qtrack('LegL',t=>[Math.sin(t*tau)*.62,0,0]),qtrack('LegR',t=>[-Math.sin(t*tau)*.62,0,0]),
    qtrack('ShinL',t=>[Math.max(0,-Math.sin(t*tau))*.70,0,0]),qtrack('ShinR',t=>[Math.max(0,Math.sin(t*tau))*.70,0,0]),
    qtrack('ArmL',t=>[-Math.sin(t*tau)*.48,0,-.07]),qtrack('ArmR',t=>[Math.sin(t*tau)*.48,0,.07]),
    qtrack('ForeL',()=>[-.16,0,0]),qtrack('ForeR',()=>[-.16,0,0]),
  ]);
  const seated = new THREE.AnimationClip('Seated',1,[
    ptrack(()=>[0,.53,0]),qtrack('LegL',()=>[-1.50,0,0]),qtrack('LegR',()=>[-1.50,0,0]),
    qtrack('ShinL',()=>[1.5,0,0]),qtrack('ShinR',()=>[1.5,0,0]),
    qtrack('ArmL',()=>[-1.49,0,-.12]),qtrack('ArmR',()=>[-1.49,0,.12]),
    qtrack('ForeL',t=>[-.23+Math.sin(t*tau)*.07,0,0]),qtrack('ForeR',t=>[-.23-Math.sin(t*tau)*.07,0,0]),
    qtrack('Head',()=>[.12,0,0]),qtrack('Spine',()=>[.09,0,0]),
  ]);
  const talk = new THREE.AnimationClip('Talk',1,[
    ...idle.tracks.filter(t=>!t.name.startsWith('ArmR')),qtrack('ArmR',t=>[-.65+Math.sin(t*tau)*.12,0,.12]),qtrack('ForeR',()=>[-.85,0,0]),
  ]);
  const guide = new THREE.AnimationClip('Guide',1,[
    ...idle.tracks.filter(t=>!t.name.startsWith('ArmR')),qtrack('ArmR',t=>[-1.2,0,.65+Math.sin(t*tau)*.08]),qtrack('ForeR',()=>[-.15,0,0]),
  ]);
  const listening=new THREE.AnimationClip('Listen',1,[...seated.tracks.filter(t=>!['ArmL','ArmR','ForeL','ForeR','Head'].some(n=>t.name.startsWith(n))),qtrack('ArmL',()=>[-.25,0,-.06]),qtrack('ArmR',()=>[-.25,0,.06]),qtrack('ForeL',()=>[-1,0,0]),qtrack('ForeR',()=>[-1,0,0]),qtrack('Head',t=>[0,Math.sin(t*tau)*.025,0])]);
  const eating=new THREE.AnimationClip('Eat',1,[...listening.tracks.filter(t=>!['ArmR','ForeR','Head'].some(n=>t.name.startsWith(n))),qtrack('ArmR',t=>[-.8-Math.sin(t*tau)*.15,0,.1]),qtrack('ForeR',t=>[-1.1-Math.sin(t*tau)*.5,0,0]),qtrack('Head',t=>[.08+Math.sin(t*tau)*.05,0,0])]);
  const applaud=new THREE.AnimationClip('Applaud',1,[...listening.tracks.filter(t=>!['ArmL','ArmR','ForeL','ForeR'].some(n=>t.name.startsWith(n))),qtrack('ArmL',t=>[-1,0,-.40+Math.cos(t*tau*2)*.2]),qtrack('ArmR',t=>[-1,0,.40-Math.cos(t*tau*2)*.2]),qtrack('ForeL',()=>[-1,0,.35]),qtrack('ForeR',()=>[-1,0,-.35])]);
  const scene=new THREE.Scene();scene.add(mesh);
  const binary = await new GLTFExporter().parseAsync(scene,{binary:true,animations:[idle,walk,seated,talk,guide,listening,eating,applaud],onlyVisible:false});
  const document=await io.readBinary(new Uint8Array(binary));
  await document.transform(dedup(),weld(),prune(),meshopt({encoder:MeshoptEncoder,level:'medium'}));
  const compressed=await io.writeBinary(document);
  await writeFile(new URL(`${name}.glb`,out),compressed);
  console.log(`${name}.glb: ${(binary.byteLength/1024).toFixed(1)} → ${(compressed.byteLength/1024).toFixed(1)} KB, 11 bones, 8 clips`);
}
await writeFile(new URL('README.txt',out),'CrowdGuard original articulated characters. Generated by scripts/generate-assets.mjs. Six appearances, eleven bones, eight animation clips. Geometry and animations are original to this project; no third-party asset license required. Units: meters; Y up; forward +Z.\n');
