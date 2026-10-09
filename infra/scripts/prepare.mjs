import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build } from 'esbuild';
import { buildDir, files, infra, root, run, sha256 } from './common.mjs';

// This command has no AWS calls and never uploads source or media.
mkdirSync(buildDir,{recursive:true});
rmSync(join(buildDir,'manifest.json'),{force:true});
for(const name of ['site','lambda']) rmSync(join(buildDir,name),{recursive:true,force:true});
run('npm',['run','typecheck']);
run('npm',['test'],{cwd:root});
run('npm',['test']);
run('npm',['run','build','--','--outDir',join(buildDir,'site')],{
  cwd:root,env:{...process.env,VITE_DEVICE_MODE:'preview'},
});
await build({
  entryPoints:[join(infra,'lambda/handler.ts')],outfile:join(buildDir,'lambda/index.mjs'),
  bundle:true,platform:'node',target:'node22',format:'esm',sourcemap:false,
  legalComments:'none',logLevel:'info',
});
// ZIP contains one bundled JS module; no node_modules, .env or references directory.
rmSync(join(buildDir,'lambda.zip'),{force:true});
run('zip',['-q','-X',join(buildDir,'lambda.zip'),'index.mjs'],{cwd:join(buildDir,'lambda')});
for(const name of ['template.yaml','bootstrap.yaml','rules.guard']) cpSync(join(infra,name),join(buildDir,name));
const outputs=[...files(join(buildDir,'site')),join(buildDir,'lambda.zip'),...['template.yaml','bootstrap.yaml','rules.guard'].map(name=>join(buildDir,name))];
const entries=outputs.map(path=>{const contents=readFileSync(path);return {path:relative(buildDir,path),bytes:contents.length,sha256:sha256(contents)};});
const forbidden=entries.find(entry=>/(^|\/)(\.env[^/]*|references|node_modules)(\/|$)|\.map$/.test(entry.path));
if(forbidden) throw new Error(`배포 제외 파일 발견: ${forbidden.path}`);
const manifest={
  createdAt:new Date().toISOString(),
  gitCommit:run('git',['rev-parse','HEAD'],{cwd:root,capture:true}),
  workingTreeDirty:!!run('git',['status','--porcelain'],{cwd:root,capture:true}),
  deviceMode:'preview',
  lambdaKey:`lambda/${entries.find(entry=>entry.path==='lambda.zip').sha256}.zip`,
  files:entries,
};
writeFileSync(join(buildDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const bytes=entries.reduce((sum,entry)=>sum+entry.bytes,0);
console.log(`배포 준비 완료: ${entries.length}개 파일, ${(bytes/1024/1024).toFixed(2)} MiB → ${buildDir}`);
console.log('AWS 리소스를 생성하거나 파일을 업로드하지 않았습니다.');
