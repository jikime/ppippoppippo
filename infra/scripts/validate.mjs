import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDir, files, infra, run, sha256 } from './common.mjs';

export async function validate(directory=infra) {
  run('uvx',['--from','cfn-lint==1.57.2','cfn-lint','--region','ap-southeast-2','--template',join(directory,'template.yaml'),join(directory,'bootstrap.yaml')]);
  // Pinned official release, isolated inside ignored build tools; no global install.
  const targets={
    'darwin-arm64':['aarch64-macos','4c1eb10c061731159eaaf0e7dbd465db9fa4b767b82186a4ab489671cc00b7d0'],
    'darwin-x64':['x86_64-macos','5089dfaa05a766cf118a020518e62f77eddbd43acf3a0b69d36b23175c6c6fda'],
    'linux-arm64':['aarch64-linux','cd378026dad0f865926ab1d1c082e2faf825f7fd888a9fe6b5c142cdf175c129'],
    'linux-x64':['x86_64-linux','8c66efb19c63e6c2bf26b9a41bbcf2f85baa8a937b01d350940194faaf64cf1d'],
  };
  let guard=process.env.CFN_GUARD_BIN;
  if(!guard) {
    const target=targets[`${process.platform}-${process.arch}`];
    if(!target) throw new Error('cfn-guard 3.2.1 실행 경로를 CFN_GUARD_BIN으로 지정해 주세요.');
    const directory=join(buildDir,'tools','guard-3.2.1');
    mkdirSync(directory,{recursive:true});
    guard=files(directory).find(path=>path.endsWith('/cfn-guard'));
    if(!guard) {
      const url=`https://github.com/aws-cloudformation/cloudformation-guard/releases/download/3.2.1/cfn-guard-v3-${target[0]}-latest.tar.gz`;
      const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
      if(!response.ok) throw new Error(`cfn-guard 다운로드 실패: ${response.status}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(sha256(bytes)!==target[1]) throw new Error('cfn-guard SHA-256 검증 실패');
      const archive=join(directory,'release.tar.gz');
      writeFileSync(archive,bytes);
      run('tar',['-xzf',archive,'-C',directory]);
      guard=files(directory).find(path=>path.endsWith('/cfn-guard'));
    }
  }
  if(!guard||!existsSync(guard)) throw new Error('cfn-guard 실행 파일이 없습니다.');
  run(guard,['--version']);
  mkdirSync(join(buildDir,'validation'),{recursive:true});
  for(const template of ['template.yaml','bootstrap.yaml']) {
    const output=run(guard,['validate','--rules',join(directory,'rules.guard'),'--data',join(directory,template),'--output-format','json'],{capture:true});
    writeFileSync(join(buildDir,'validation',`${template}.guard.json`),output+'\n');
    console.log(`${template}: cfn-lint 및 프로젝트 cfn-guard 규칙 통과 (${readFileSync(join(directory,template)).length} bytes)`);
  }
}
if(process.argv[1]===join(infra,'scripts','validate.mjs')) await validate();
