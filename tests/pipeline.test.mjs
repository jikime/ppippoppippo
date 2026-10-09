import test from 'node:test';
import assert from 'node:assert/strict';
import {createPipeline,readPipelineConfig,isPipelineConfigured,validateStudioRequest,validateGenerate,safeModelURL,publicPipelineError} from '../lib/pipeline.mjs';

const ID='550e8400-e29b-41d4-a716-446655440000';
const ENV={AWS_WORKER_URL:'https://abcdefghij.execute-api.ap-northeast-2.amazonaws.com',AWS_WORKER_TOKEN:'test-only-server-token-not-a-real-credential'};
const INPUT={requestId:ID,prompt:'A fictional adult in complete casual clothing.',seed:123,quality:'high',heightMeters:1.75};
const signed=host=>`https://${host}/jobs/model.glb?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${'a'.repeat(64)}`;
const json=(body,status=200,headers={})=>Response.json(body,{status,headers});
const job=(state='QUEUED')=>({id:ID,requestId:ID,characterId:ID,state,status:state,stage:'image',progress:0,attempt:1,rigged:false,animated:false,allowImageRetryRequired:false});
function glb(length=24) { const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,length,true);return bytes; }
function client(fetchImpl,extra={}) { return createPipeline({environment:ENV,fetchImpl,...extra}); }

test('fixed HTTPS API Gateway config; no caller host, token, or stage tricks',()=>{
  assert.equal(readPipelineConfig(ENV).baseURL,ENV.AWS_WORKER_URL);
  assert.equal(readPipelineConfig({...ENV,AWS_WORKER_URL:ENV.AWS_WORKER_URL+'/prod/'}).baseURL,ENV.AWS_WORKER_URL+'/prod');
  assert.equal(isPipelineConfigured({}),false);
  for(const value of ['http://abcdefghij.execute-api.ap-northeast-2.amazonaws.com','https://localhost','https://127.0.0.1','https://169.254.169.254','https://evil.example','https://abcdefghij.execute-api.ap-northeast-2.amazonaws.com.evil.example','https://u:p@abcdefghij.execute-api.ap-northeast-2.amazonaws.com','https://abcdefghij.execute-api.ap-northeast-2.amazonaws.com:8443',ENV.AWS_WORKER_URL+'/?next=https://evil.example',ENV.AWS_WORKER_URL+'/#x',ENV.AWS_WORKER_URL+'/prod/jobs'])
    assert.throws(()=>readPipelineConfig({...ENV,AWS_WORKER_URL:value}));
  assert.throws(()=>readPipelineConfig({...ENV,AWS_WORKER_TOKEN:'x\r\nAuthorization:y'}));
});

test('POST requires same origin AND studio header AND JSON',()=>{
  const make=(headers={},method='POST')=>new Request('https://studio.example/api/pipeline',{method,headers:{Origin:'https://studio.example','x-crowd-request':'studio','Content-Type':'application/json',...headers}});
  assert.doesNotThrow(()=>validateStudioRequest(make()));
  for(const headers of [{Origin:'https://evil.example'},{Origin:''},{'x-crowd-request':''},{'x-crowd-request':'other'},{'Content-Type':'text/plain'}])assert.throws(()=>validateStudioRequest(make(headers)));
  assert.throws(()=>validateStudioRequest(make({},'GET')));
});

test('generation bounds, canonical requestId, and no arbitrary forwarded properties',()=>{
  assert.deepEqual(validateGenerate({...INPUT,workerURL:'https://evil.example',apiKey:'do-not-forward'}),{...INPUT,characterId:ID});
  for(const update of [{requestId:'../health'},{prompt:''},{prompt:'x'.repeat(801)},{seed:-1},{seed:2**32},{seed:'1'},{quality:'ultra'},{heightMeters:.9},{heightMeters:2.31},{heightMeters:'1.75'},{characterId:''}])assert.throws(()=>validateGenerate({...INPUT,...update}));
  assert.doesNotThrow(()=>validateGenerate({...INPUT,prompt:'😀'.repeat(800),seed:0xffffffff,heightMeters:2.3}));
});

test('health preserves only verified native data and does not expose configuration',async()=>{
  let sent;
  const output=await client(async(url,options)=>{sent={url,options};return json({ok:true,service:'static-character-jobs',rigged:false,animated:false,token:ENV.AWS_WORKER_TOKEN});}).verify();
  assert.deepEqual(output,{ok:true,service:'static-character-jobs',rigged:false,animated:false});
  assert.equal(sent.url,ENV.AWS_WORKER_URL+'/health');assert.equal(sent.options.headers.Authorization,'Bearer '+ENV.AWS_WORKER_TOKEN);assert.equal(sent.options.redirect,'error');
  await assert.rejects(client(async()=>json({ok:false,service:'static-character-jobs'})).verify());
});

test('generate forwards one idempotent POST and preserves QUEUED, not success',async()=>{
  const calls=[];const result=await client(async(url,options)=>{calls.push({url,options});return json(job(),202);}).generate(INPUT);
  assert.equal(calls.length,1);assert.equal(calls[0].url,ENV.AWS_WORKER_URL+'/jobs');assert.equal(calls[0].options.method,'POST');
  assert.equal(JSON.parse(calls[0].options.body).requestId,ID);assert.equal(JSON.parse(calls[0].options.body).characterId,ID);
  assert.equal(result.state,'QUEUED');assert.equal(result.status,'QUEUED');assert.equal(result.rigged,false);
});

test('status preserves terminal errors, strips signed links/debug and remote messages',async()=>{
  const result=await client(async()=>json({...job('NEEDS_ATTENTION'),imageUrl:signed('private-bucket.s3.ap-northeast-2.amazonaws.com'),debug:{token:ENV.AWS_WORKER_TOKEN},error:{code:'IMAGE_REQUEST_UNCERTAIN',message:ENV.AWS_WORKER_TOKEN,stage:'image'}})).status(ID);
  assert.equal(result.state,'NEEDS_ATTENTION');assert.equal(result.hasImage,true);assert.equal(result.imageUrl,undefined);assert.equal(result.debug,undefined);
  assert.equal(result.error.code,'IMAGE_REQUEST_UNCERTAIN');assert.ok(!JSON.stringify(result).includes(ENV.AWS_WORKER_TOKEN));
  await assert.rejects(client(async()=>json({...job(),state:'INVENTED_STATUS'})).status(ID));
  await assert.rejects(client(async()=>json({...job(),status:'SUCCEEDED'})).status(ID));
});

test('retry sends only explicit boolean; image retry opt-in remains a 409',async()=>{
  let sent;
  const service=client(async(url,options)=>{sent={url,options};return json({error:{code:'IMAGE_RETRY_REQUIRES_OPT_IN',message:'internal secret'}},409);});
  await assert.rejects(service.retry(ID,false),error=>error.status===409&&error.code==='IMAGE_RETRY_REQUIRES_OPT_IN'&&!error.message.includes('secret'));
  assert.equal(sent.url,ENV.AWS_WORKER_URL+'/jobs/'+ID+'/retry');assert.deepEqual(JSON.parse(sent.options.body),{allowImageRetry:false});
  await assert.rejects(service.retry(ID,undefined));
});

test('ambiguous paid request is not automatically repeated; unknown flag and redacted errors',async()=>{
  let calls=0;
  await assert.rejects(client(async()=>{calls++;throw new Error(ENV.AWS_WORKER_TOKEN);}).generate(INPUT),error=>error.unknown===true&&!error.message.includes(ENV.AWS_WORKER_TOKEN));
  assert.equal(calls,1);
  await assert.rejects(client(async()=>json({error:{code:'ENQUEUE_PENDING',message:ENV.AWS_WORKER_TOKEN}},503)).generate(INPUT),error=>error.unknown===true&&error.code==='ENQUEUE_PENDING');
  assert.ok(!JSON.stringify(publicPipelineError(new Error(ENV.AWS_WORKER_TOKEN))).includes(ENV.AWS_WORKER_TOKEN));
});

test('S3 exact-host and SigV4 allowlist blocks SSRF and unsigned URLs',()=>{
  for(const host of ['bucket-name.s3.ap-northeast-2.amazonaws.com','bucket-name.s3-us-west-2.amazonaws.com','bucket-name.s3.amazonaws.com','bucket-name.s3.dualstack.ap-northeast-2.amazonaws.com','s3.ap-northeast-2.amazonaws.com','s3.amazonaws.com'])assert.equal(safeModelURL(signed(host)).hostname,host);
  for(const host of ['localhost','127.0.0.1','169.254.169.254','bucket-name.s3.ap-northeast-2.amazonaws.com.evil.example','s3-website.ap-northeast-2.amazonaws.com','bucket-name.cloudfront.net'])assert.throws(()=>safeModelURL(signed(host)));
  assert.throws(()=>safeModelURL('https://bucket-name.s3.amazonaws.com/model.glb'));
  assert.throws(()=>safeModelURL(signed('bucket-name.s3.amazonaws.com').replace('https:','http:')));
  assert.throws(()=>safeModelURL(signed('u:p@bucket-name.s3.amazonaws.com')));
});

test('download fetches validated S3 without Authorization and returns actual GLB bytes',async()=>{
  const calls=[];const bytes=glb();
  const response=await client(async(url,options)=>{calls.push({url:String(url),options});return calls.length===1?json({url:signed('bucket-name.s3.ap-northeast-2.amazonaws.com'),format:'glb'}):new Response(bytes);}).download(ID);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.equal(calls.length,2);
  assert.equal(calls[1].options.headers.Authorization,undefined);assert.equal(calls[1].options.redirect,'error');assert.equal(calls[1].options.credentials,'omit');
  assert.equal(response.headers.get('Content-Type'),'model/gltf-binary');
});

test('download fails before fetch on unsafe URL, refuses oversized and invalid GLB content',async()=>{
  let calls=0;
  await assert.rejects(client(async()=>{calls++;return json({url:'https://169.254.169.254/latest/meta-data',format:'glb'});}).download(ID));assert.equal(calls,1);
  for(const bad of [()=>new Response(glb(80),{headers:{'Content-Length':'80'}}),()=>new Response('<html>NOT A GLB</html>')]) {
    let n=0;await assert.rejects(client(async()=>++n===1?json({url:signed('bucket-name.s3.amazonaws.com'),format:'glb'}):bad(),{maxModelBytes:64}).download(ID));
  }
});

test('stream size and truncation limits hold without Content-Length',async()=>{
  for(const chunks of [[glb(24).subarray(0,12),new Uint8Array(100)],[glb(24).subarray(0,12)]]) {
    let n=0;const response=await client(async()=>++n===1?json({url:signed('bucket-name.s3.amazonaws.com'),format:'glb'}):new Response(new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}})),{maxModelBytes:64}).download(ID);
    await assert.rejects(response.arrayBuffer());
  }
});
