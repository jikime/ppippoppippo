import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { aws, buildDir, loadConfig } from './common.mjs';

// By default this verifies hosting and configuration without invoking OpenAI.
const config=loadConfig({required:true});
const stack=JSON.parse(aws(config,['cloudformation','describe-stacks','--stack-name',config.stackName])).Stacks[0];
if(!['CREATE_COMPLETE','UPDATE_COMPLETE'].includes(stack.StackStatus)) throw new Error(`스택 상태 확인 필요: ${stack.StackStatus}`);
const outputs=Object.fromEntries(stack.Outputs.map(value=>[value.OutputKey,value.OutputValue]));
const url=outputs.WebsiteUrl;
const checks=[];
async function request(label,address,{expected=200,...init}={}) {
  const response=await fetch(address,{...init,signal:AbortSignal.timeout(30000)});
  if(response.status!==expected) throw new Error(`${label}: HTTP ${response.status}, 예상 ${expected}`);
  checks.push({label,status:response.status});
  console.log(`${label}: HTTP ${response.status}`);
  return response;
}
const html=await (await request('웹 화면',url)).text();
if(!html.includes('id="root"')) throw new Error('React 시작 문서를 확인하지 못했습니다.');
const status=await (await request('AI 상태',url+'/api/decisions/status')).json();
if(status.configured!==Boolean(config.openAISecretArn)||status.model!=='gpt-6-luna') throw new Error('AI 상태가 배포 설정과 다릅니다.');
for(const camera of ['cam1','cam2']) {
  const response=await request(`CCTV ${camera} 부분 재생`,`${url}/media/cctv/${camera}.mp4`,{expected:206,headers:{Range:'bytes=0-1023'}});
  await response.arrayBuffer();
  if(!response.headers.get('content-range')?.startsWith('bytes 0-1023/')) throw new Error('영상 Range 응답을 확인하지 못했습니다.');
}
await request('API 원본 직접 접근 차단',outputs.ApiEndpoint+'/api/decisions/status',{expected:401});
await request('S3 직접 접근 차단',`https://${outputs.SiteBucketName}.s3.${config.region}.amazonaws.com/index.html`,{expected:403,method:'HEAD'});

if(process.argv.includes('--live-ai')) {
  if(!status.configured) throw new Error('실제 AI 검증에는 OpenAI 비밀 설정이 필요합니다.');
  const context={phase:'lunch',minute:720,inside:120,moving:30,waiting:0,blocked:0,expected:0,guidance:false,
    exits:['A','B','C'].map(id=>({id,open:true,queue:0})),note:'AWS 배포 연결 확인용 합성 상황입니다. 점심 이동을 나눠 진행하려고 합니다.'};
  const evaluate=await (await request('실제 OpenAI 판단',url+'/api/decisions/evaluate',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify(context),
  })).json();
  if(evaluate.source!=='openai-decisions'||!evaluate.action) throw new Error('판단 응답 계약이 다릅니다.');
  // Respect the application's 2.5-second minimum interval within a warm Lambda.
  await new Promise(resolve=>setTimeout(resolve,2700));
  const review=await (await request('실제 OpenAI 검토',url+'/api/decisions/review',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({completed:1,seed:123,findings:[]}),
  })).json();
  if(review.source!=='openai-decisions'||!review.rule) throw new Error('검토 응답 계약이 다릅니다.');
  checks.push({label:'OpenAI 응답 계약',model:evaluate.model,action:evaluate.action,reviewRule:review.rule});
}
mkdirSync(buildDir,{recursive:true});
writeFileSync(join(buildDir,'deployment.json'),JSON.stringify({checkedAt:new Date().toISOString(),stack:config.stackName,region:config.region,url,outputs,checks},null,2)+'\n');
console.log(`배포 검증 완료: ${url}`);
