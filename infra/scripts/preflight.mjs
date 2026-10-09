import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { aws, buildDir, checkAWS, infra, loadConfig, verifyArtifacts } from './common.mjs';

export function preflight(config=loadConfig(),directory=infra) {
  const result=checkAWS(config);
  for(const name of ['bootstrap.yaml','template.yaml']) {
    aws(config,['cloudformation','validate-template','--template-body',`file://${join(directory,name)}`]);
    console.log(`${name}: AWS validate-template 통과`);
  }
  if(existsSync(join(buildDir,'manifest.json'))) {
    const manifest=verifyArtifacts();
    console.log(`배포 파일 해시 확인: ${manifest.files.length}개 / ${manifest.createdAt}`);
  } else console.log('배포 파일: prepare:aws 실행 필요');
  console.log('공개 범위: 화면·CCTV·AI API 모두 공개 (IP·방문자 로그인 제한 없음)');
  console.log(config.openAISecretArn?'OpenAI secret ARN 확인 완료 (비밀 값은 조회하지 않음)':'AI 비활성 상태로 배포 가능: OpenAI secret ARN 미설정');
  console.log('읽기 전용 점검입니다. IAM·서비스 할당량·실제 리소스 생성 성공 여부는 배포 단계에서 확인됩니다.');
  return result;
}
if(process.argv[1]===join(infra,'scripts','preflight.mjs')) preflight();
