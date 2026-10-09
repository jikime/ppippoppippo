import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

test('compressed avatar assets retain skeletons, vertex weights, and all five animations',async()=>{
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  for(const name of ['participant-teal','participant-navy','participant-cream','operator','judge','host']){
    const file=await readFile(`public/models/${name}.glb`);const doc=await io.readBinary(file);
    expect(file.byteLength).toBeLessThan(60000);
    expect(doc.getRoot().listSkins().length).toBeGreaterThan(0);
    expect(doc.getRoot().listSkins()[0].listJoints()).toHaveLength(11);
    expect(doc.getRoot().listAnimations().map(a=>a.getName()).sort()).toEqual(['Guide','Idle','Seated','Talk','Walk']);
    const mesh=doc.getRoot().listMeshes()[0];
    expect(mesh.listPrimitives()[0].getAttribute('WEIGHTS_0')).not.toBeNull();
  }
},10000);
