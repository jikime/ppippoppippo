import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awsRequest} from '../lib/aws-browser.mjs';
const id='12345678-1234-4234-8234-123456789012';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status});
test('AWS static client uses the durable UUID and only the app bearer token',async()=>{
 let calls=[];
 const result=await awsRequest({action:'generate',requestId:id,characterId:'aws-001',prompt:'Fully clothed person',quality:'high',heightMeters:1.75,seed:1},'operator-test-token',async(url,options)=>{calls.push({url,options});return json({id,status:'QUEUED',stage:'image'});});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/jobs');assert.equal(JSON.parse(calls[0].options.body).requestId,id);assert.equal(calls[0].options.headers.Authorization,'Bearer operator-test-token');assert.equal(result.status,'QUEUED');
});
test('failed health and failed job responses are never successful connection',async()=>{
 await assert.rejects(()=>awsRequest({action:'verify'},'token',async()=>json({ok:false})),/응답/);
 await assert.rejects(()=>awsRequest({action:'status',id},'token',async()=>json({error:{message:'Not authorized'}},401)),/Not authorized/);
});
test('S3 GLB download does not forward the application token',async()=>{
 const data=new Uint8Array(24);const v=new DataView(data.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,24,true);
 const url='https://test-assets.s3.ap-northeast-2.amazonaws.com/model.glb?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature='+'a'.repeat(64);
 let calls=[];const result=await awsRequest({action:'download',id},'secret-app-token',async(u,o)=>{calls.push({u,o});return calls.length===1?json({url,format:'glb'}):new Response(data);});
 assert.equal(result.byteLength,24);assert.equal(calls[1].o.credentials,'omit');assert.equal(calls[1].o.headers,undefined);assert.equal(calls[1].o.redirect,'error');
});
test('unsafe asset URLs and invalid GLB bytes are rejected',async()=>{
 let count=0;await assert.rejects(()=>awsRequest({action:'download',id},'token',async()=>{count++;return json({url:'https://example.com/model.glb'});}));assert.equal(count,1);
 const url='https://test-assets.s3.ap-northeast-2.amazonaws.com/model.glb?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature='+'a'.repeat(64);
 count=0;await assert.rejects(()=>awsRequest({action:'download',id},'token',async()=>++count===1?json({url}):new Response('not a model')),/GLB/);
});
