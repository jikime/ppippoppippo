import { join } from 'node:path';
import { aws, buildDir, loadConfig, verifyArtifacts } from './common.mjs';
import { preflight } from './preflight.mjs';
import { validate } from './validate.mjs';

// This is the only command that creates or changes AWS resources.
const config=loadConfig({required:true});
const manifest=verifyArtifacts();
await validate(buildDir);
preflight(config,buildDir);
const outputs=name=>Object.fromEntries(JSON.parse(aws(config,['cloudformation','describe-stacks','--stack-name',name])).Stacks[0].Outputs.map(output=>[output.OutputKey,output.OutputValue]));
const deploy=(name,template,parameters=[])=>aws(config,[
  'cloudformation','deploy','--stack-name',name,'--template-file',join(buildDir,template),
  '--no-fail-on-empty-changeset','--capabilities','CAPABILITY_IAM',
  '--tags','Project=ppippoppippo','ManagedBy=CloudFormation',
  ...(parameters.length?['--parameter-overrides',...parameters]:[]),
],{capture:false});

console.log(`배포 시작: ${config.stackName} / 준비 시각 ${manifest.createdAt}`);
const bootstrapName=`${config.stackName}-artifacts`;
deploy(bootstrapName,'bootstrap.yaml');
const bucket=outputs(bootstrapName).ArtifactsBucketName;
aws(config,['s3','cp',join(buildDir,'lambda.zip'),`s3://${bucket}/${manifest.lambdaKey}`,'--only-show-errors'],{capture:false});
deploy(config.stackName,'template.yaml',[
  `ArtifactBucket=${bucket}`,`ArtifactKey=${manifest.lambdaKey}`,
  `OpenAISecretArn=${config.openAISecretArn}`,`SecretRevision=${config.secretRevision}`,
]);
const deployed=outputs(config.stackName);
// Publish dependencies first, HTML last. Keep old hashed assets for existing tabs.
aws(config,['s3','cp',join(buildDir,'site','assets'),`s3://${deployed.SiteBucketName}/assets`,
  '--recursive','--cache-control','public,max-age=31536000,immutable','--only-show-errors'],{capture:false});
aws(config,['s3','cp',join(buildDir,'site'),`s3://${deployed.SiteBucketName}/`,
  '--recursive','--exclude','assets/*','--exclude','index.html','--cache-control','no-cache','--only-show-errors'],{capture:false});
aws(config,['s3','cp',join(buildDir,'site','index.html'),`s3://${deployed.SiteBucketName}/index.html`,
  '--cache-control','no-cache','--content-type','text/html; charset=utf-8','--only-show-errors'],{capture:false});
const invalidation=JSON.parse(aws(config,['cloudfront','create-invalidation','--distribution-id',deployed.DistributionId,'--paths','/*']));
aws(config,['cloudfront','wait','invalidation-completed','--distribution-id',deployed.DistributionId,'--id',invalidation.Invalidation.Id]);
console.log(`배포 완료: ${deployed.WebsiteUrl}`);
console.log('공개 주소에서 화면과 /api/decisions/status를 확인해 주세요. AI 실제 호출은 별도 사용량이 발생합니다.');
