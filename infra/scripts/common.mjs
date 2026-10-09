import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const infra=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const root=resolve(infra,'..');
export const buildDir=join(infra,'.build');
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function run(command,args,options={}) {
  const result=spawnSync(command,args,{cwd:infra,encoding:'utf8',stdio:options.capture?'pipe':'inherit',...options});
  if (result.error) throw result.error;
  if (result.status!==0) throw new Error(`${command} 실패 (${result.status})${options.capture?`: ${[result.stdout,result.stderr].filter(Boolean).join('\n').trim()}`:''}`);
  return result.stdout?.trim()??'';
}
export function files(directory) {
  return readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    const path=join(directory,entry.name);
    if(entry.isSymbolicLink()) throw new Error(`심볼릭 링크는 배포에 포함할 수 없습니다: ${path}`);
    return entry.isDirectory()?files(path):entry.isFile()?[path]:[];
  });
}
export function loadConfig({required=false}={}) {
  const path=join(infra,'config.local.json');
  if(required&&!existsSync(path)) throw new Error('config.example.json을 config.local.json으로 복사하고 배포 설정을 확인해 주세요.');
  const config=JSON.parse(readFileSync(existsSync(path)?path:join(infra,'config.example.json'),'utf8'));
  if(config.profile!=='ppippoppippo'||config.region!=='ap-southeast-2') throw new Error('이 프로젝트는 ppippoppippo 프로필과 ap-southeast-2 리전을 사용합니다.');
  if(!/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/.test(config.stackName)) throw new Error('stackName은 영문자로 시작하는 40자 이하 영문·숫자·하이픈으로 입력해 주세요.');
  if(typeof config.openAISecretArn!=='string'||!/^$|^arn:aws:secretsmanager:ap-southeast-2:[0-9]{12}:secret:[a-zA-Z0-9/_+=.@-]+$/.test(config.openAISecretArn)) throw new Error('OpenAI 키 값 대신 시드니 리전 Secrets Manager ARN을 입력해 주세요.');
  if(typeof config.secretRevision!=='string'||!/^[a-zA-Z0-9._-]{1,64}$/.test(config.secretRevision)) throw new Error('secretRevision 형식을 확인해 주세요.');
  return config;
}
export function aws(config,args,{capture=true}={}) {
  return run('aws',[...args,'--profile',config.profile,'--region',config.region,'--no-cli-pager',...(capture?['--output','json']:[])],{capture});
}
export function checkAWS(config) {
  const identity=JSON.parse(aws(config,['sts','get-caller-identity']));
  const plan=JSON.parse(aws(config,['freetier','get-account-plan-state']));
  if(config.openAISecretArn&&config.openAISecretArn.split(':')[4]!==identity.Account) throw new Error('OpenAI secret은 현재 프로젝트와 같은 AWS 프로젝트에 있어야 합니다.');
  if(config.openAISecretArn) aws(config,['secretsmanager','describe-secret','--secret-id',config.openAISecretArn]);
  console.log(`AWS 프로젝트 ${identity.Account} / ${config.region} / 요금제 ${plan.accountPlanType} (${plan.accountPlanStatus})`);
  return {identity,plan};
}
export function verifyArtifacts() {
  const manifest=JSON.parse(readFileSync(join(buildDir,'manifest.json'),'utf8'));
  for(const entry of manifest.files) {
    const path=resolve(buildDir,entry.path);
    if(!path.startsWith(buildDir+'/')||sha256(readFileSync(path))!==entry.sha256) throw new Error(`배포 산출물 변경 감지: ${entry.path}. prepare:aws를 다시 실행해 주세요.`);
  }
  const actual=files(join(buildDir,'site')).map(path=>path.slice(buildDir.length+1)).sort();
  const expected=manifest.files.filter(entry=>entry.path.startsWith('site/')).map(entry=>entry.path).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected)) throw new Error('사이트 파일 목록이 준비된 배포본과 다릅니다.');
  return manifest;
}
