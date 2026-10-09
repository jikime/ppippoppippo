import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Color } from 'three';
import { AVATAR_VARIANTS } from './appearance';
import { roleColors } from './layout';

test('compressed avatar assets retain skeletons, vertex weights, and all eight animations',async()=>{
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  for(const name of AVATAR_VARIANTS){
    const file=await readFile(`public/models/${name}.glb`);const doc=await io.readBinary(file);
    expect(file.byteLength).toBeLessThan(60000);
    expect(doc.getRoot().listSkins().length).toBeGreaterThan(0);
    expect(doc.getRoot().listSkins()[0].listJoints()).toHaveLength(11);
    expect(doc.getRoot().listAnimations().map(a=>a.getName()).sort()).toEqual(['Applaud','Eat','Guide','Idle','Listen','Seated','Talk','Walk']);
    const mesh=doc.getRoot().listMeshes()[0];
    expect(mesh.listPrimitives()[0].getAttribute('WEIGHTS_0')).not.toBeNull();
    // The baked distant avatars and full rigs both inherit these GLB colors.
    const role=name.startsWith('participant-')?'participant':name as keyof typeof roleColors;
    const expected=new Color(roleColors[role]).toArray();
    const colors=mesh.listPrimitives()[0].getAttribute('COLOR_0')!;
    let uniformVertices=0;
    for(let i=0;i<colors.getCount();i++){
      const actual=colors.getElement(i,[]);
      if(expected.every((value,channel)=>Math.abs(actual[channel]-value)<.01))uniformVertices++;
    }
    expect(uniformVertices/colors.getCount(),`${name} uniform must match the role legend`).toBeGreaterThan(.06);
  }
},10000);
