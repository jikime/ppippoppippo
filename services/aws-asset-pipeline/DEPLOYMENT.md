# AWS asset pipeline deployment

Prepared source only: nothing has been deployed, and the GPU installation and generation are unverified. `template.yaml` creates a CloudFront distribution with a private S3 frontend origin, Lambda HTTP API, DynamoDB job table, SQS queue and DLQ, private S3 asset bucket, generated bearer-token secret, and EC2 worker instance profile. It deliberately does not create an EC2 instance, VPC, subnet, or security group.

The original Microsoft TRELLIS recipe requires Linux, an NVIDIA GPU with at least 16 GB VRAM, and a CUDA toolkit. This bootstrap uses Python 3.10, PyTorch 2.4.0 and CUDA 11.8, with xformers attention. See [TRELLIS installation](https://github.com/microsoft/TRELLIS#-installation). A candidate worker is `g6.xlarge` (L4, 24 GB); `g5.xlarge` (A10G, 24 GB) is another baseline to validate. Availability, quotas and compatibility must be checked in your Region; neither has been benchmarked here.

## 1. Package and stage code

Use a deployment identity in one AWS account and Region. Prepare an existing private, SSE-S3-encrypted artifact bucket in that Region, and an existing Secrets Manager secret containing either the OpenAI key as a raw string or `{"apiKey":"..."}`. The template assumes the default Secrets Manager KMS key; customer-managed KMS keys need explicit decrypt permissions and key policies. Do not put the key in this repository or the bootstrap command.

Create `api.zip` with `api.py` at the archive root; the Lambda runtime provides boto3. Create `worker.zip` with `worker.py`, its sibling Python modules, `requirements-worker.txt` and `bootstrap-worker.sh` at the archive root. Do not include credentials, model weights, tests, virtual environments or `.git`. For example, in PowerShell from this directory:

```powershell
New-Item -ItemType Directory -Force build | Out-Null
Compress-Archive -LiteralPath api.py -DestinationPath build/api.zip -Force
# Add any additional worker-only Python modules if introduced later.
Compress-Archive -Path worker.py,requirements-worker.txt,bootstrap-worker.sh -DestinationPath build/worker.zip -Force
```

The following are operator-run deployment commands; they create billable resources. Set the variables to your own values and use a new immutable artifact prefix for every release:

```bash
export AWS_REGION=YOUR_REGION
export ARTIFACT_BUCKET=YOUR_PRIVATE_ARTIFACT_BUCKET
export RELEASE=release-001
export OPENAI_SECRET_ARN=arn:aws:secretsmanager:YOUR_REGION:YOUR_ACCOUNT:secret:YOUR_SECRET
export STACK_NAME=asset-pipeline
aws s3 cp build/api.zip "s3://$ARTIFACT_BUCKET/$RELEASE/api.zip"
aws s3 cp build/worker.zip "s3://$ARTIFACT_BUCKET/$RELEASE/worker.zip"
aws cloudformation validate-template --template-body file://template.yaml
aws cloudformation deploy --stack-name "$STACK_NAME" --template-file template.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides ArtifactBucket="$ARTIFACT_BUCKET" \
    ApiCodeKey="$RELEASE/api.zip" WorkerCodeKey="$RELEASE/worker.zip" \
    OpenAISecretArn="$OPENAI_SECRET_ARN" AllowedOrigin="http://localhost:5173"
aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' --output table
```

Use the actual browser origin for `AllowedOrigin` when calling API Gateway directly from another origin. Calls through CloudFront's `/api` prefix use the frontend's own origin, so they do not need a second CORS origin. Authentication is checked by `api.py` on **all five routes**, including `/health`; the CloudFormation route authorization type is `NONE` because this is application-level bearer authentication. A single shared token is suitable for a private prototype; it does not provide per-user authorization. The static HTML is public through CloudFront. The user enters this app's bearer token at runtime; never embed it, the OpenAI key, or AWS credentials in HTML, JavaScript, build variables, or uploaded files.

## 2. Publish the reviewed frontend build

CloudFront's default behavior reads the private `FrontendBucketName` using Origin Access Control (OAC). Only this distribution can read objects through the bucket policy; S3 public access remains blocked. The default viewer-request function maps extensionless frontend routes to `/index.html`. It is not attached to the API behavior, and there is no global error-to-HTML fallback.

`/api/*` uses the HTTP API as its HTTPS origin. A separate viewer-request function strips `/api`, so `/api/jobs` reaches `/jobs`. AWS's managed CachingDisabled policy disables API caching, while AllViewerExceptHostHeader forwards `Authorization` and supplies the API origin's Host header. See [AWS managed origin policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html#managed-origin-request-policy-all-viewer-except-host-header).

Build the frontend with `/api` as its API base, review the generated `dist/aws-web` directory, and explicitly execute the following command when ready to publish. The script is not invoked by CloudFormation or bootstrap:

```bash
bash deploy-frontend.sh /path/to/dist/aws-web STACK_FrontendBucketName STACK_CloudFrontDistributionId
```

The script uploads static files first, uploads `index.html` last, and requests a CloudFront invalidation. It preserves earlier assets for existing browser sessions. The deployment identity needs `s3:ListBucket`, `s3:PutObject` on the frontend bucket and `cloudfront:CreateInvalidation` on this distribution; the worker role has no frontend publishing permissions. Wait for the distribution and invalidation to finish, then open the stack's `FrontendUrl`, enter the app bearer token, and verify `/api/health` and a job through the browser. A custom domain and certificate are not included.

The separate assets bucket permits cross-origin GET/HEAD requests from `*` so browser model loaders can read presigned GLB URLs. This is CORS permission, not public S3 access: an authorized presigned URL is still required. Load models without cookies or credentialed CORS requests; do not forward the app bearer token to S3.

## 3. Prepare one GPU worker using SSM

Manually launch an x86_64 Ubuntu 22.04 GPU host with a compatible NVIDIA driver, CUDA Toolkit **11.8 including nvcc**, Conda and AWS CLI v2. Allocate enough disk for CUDA builds and model weights (a 200 GB encrypted gp3 root volume is a starting allocation to measure). Do not assume a current Deep Learning AMI contains this older toolkit. Review the chosen AMI, CUDA and Conda installation separately before bootstrap.

Attach the stack's `WorkerInstanceProfileName`. Require IMDSv2 (`HttpTokens=required`), attach a security group with **no inbound rules**, and connect only through AWS Systems Manager Session Manager. Install/start the SSM agent if the AMI lacks it. The host needs outbound HTTPS to AWS, package repositories, GitHub, Hugging Face, and OpenAI; use a private subnet with NAT or another approved egress path. AWS service endpoints alone do not provide the third-party internet access needed for setup and model downloads. The template does not grant SSH access or allocate a public IP.

Inside the SSM shell, download the worker artifact using the instance role, then run its bootstrap with output values from the stack. Set `TRELLIS_REF` to a reviewed **full commit SHA** from [the original TRELLIS repository](https://github.com/microsoft/TRELLIS/commits/main/); the script refuses a moving branch name. The upstream setup still fetches some dependencies without immutable pins, so save the resulting environment and GPU smoke-test it before treating it as a reproducible deployment.

```bash
export AWS_REGION=YOUR_REGION
export WORKER_ARTIFACT_URI=s3://YOUR_ARTIFACT_BUCKET/YOUR_RELEASE/worker.zip
aws s3 cp "$WORKER_ARTIFACT_URI" /tmp/worker.zip --region "$AWS_REGION"
unzip -p /tmp/worker.zip bootstrap-worker.sh > /tmp/bootstrap-worker.sh
sudo env AWS_REGION="$AWS_REGION" \
  JOBS_TABLE="STACK_JobsTableName" JOBS_QUEUE_URL="STACK_JobsQueueUrl" \
  ASSETS_BUCKET="STACK_AssetsBucketName" OPENAI_SECRET_ARN="STACK_OpenAISecretArn" \
  WORKER_ARTIFACT_URI="$WORKER_ARTIFACT_URI" \
  TRELLIS_REF="REVIEWED_40_CHARACTER_COMMIT_SHA" \
  CONDA_EXE=/opt/conda/bin/conda CUDA_HOME=/usr/local/cuda-11.8 \
  bash /tmp/bootstrap-worker.sh
sudo systemctl enable --now asset-worker
sudo journalctl -u asset-worker -f
```

This one-time bootstrap downloads the artifact, creates an unprivileged `assetworker` account and a dedicated environment, installs original TRELLIS and worker requirements, checks CUDA/imports, and writes a systemd service. No Hugging Face token is configured. Public model weights are downloaded on first use. AWS SDKs obtain credentials from the instance role, and the worker obtains the OpenAI secret at runtime. A failed setup should be diagnosed on this host or retried on a fresh host; it intentionally refuses to overwrite an existing `/opt/asset-pipeline`.

## 4. Verify a complete job

With a separate authorized operator identity, retrieve `ApiTokenSecretArn` from Secrets Manager, parse its `apiToken` field into a private environment variable, and set `API_URL` to the stack's `FrontendUrl` plus `/api` (or the direct `ApiUrl` for diagnosis). Avoid printing or committing the token. The operator needs `secretsmanager:GetSecretValue`; the worker role intentionally cannot read this bearer secret.

```bash
curl --fail-with-body -H "Authorization: Bearer $API_TOKEN" "$API_URL/health"
curl --fail-with-body -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' -X POST "$API_URL/jobs" \
  --data '{"requestId":"787395b5-342a-4c31-a931-c0b57bcb23b9","characterId":"smoke-test","prompt":"A single fully clothed adult person, neutral standing pose, full body, plain background","seed":1,"quality":"standard","heightMeters":1.75}'
curl --fail-with-body -H "Authorization: Bearer $API_TOKEN" \
  "$API_URL/jobs/787395b5-342a-4c31-a931-c0b57bcb23b9"
```

Use a new UUID for a new request; reuse the same UUID and parameters when recovering a submit timeout. The create request incurs an image-generation charge once the worker processes it. Poll job status until completion, request `GET /jobs/{id}/model`, and verify that its returned short-lived URL downloads a valid GLB that opens at the intended scale and orientation. Mesh processing normalizes Y-up, height and feet position; it does not guarantee which direction the person faces, so review the result and adjust `forwardYaw` manually if needed. `/health` confirms the API responds; it does not prove GPU readiness or generation quality. Test a failed job and its explicit retry path before wider use. Where no saved source image exists, a retry requires `allowImageRetry=true`, which authorizes another paid image request.

## Operations and limits

The API role can list only the dedicated assets bucket, alongside reading `jobs/*` objects. This lets retry-time `HeadObject` return 404 for an actually absent image, which permits the explicit `allowImageRetry` path. A 403 is treated as an access problem, not absence: fix permissions before retrying, and do not bypass the fail-closed response by creating another UUID.

For a hung GPU task, use SSM to run `sudo systemctl stop asset-worker`. The current service has `TimeoutStopSec=90`; systemd terminates the remaining process after that shutdown window. Inspect the worker journal and GPU/host health, repair the environment, then run `sudo systemctl start asset-worker`. Let the last 180-second DynamoDB lease and SQS visibility window expire before expecting redelivery. A running CUDA call has no automatic watchdog and may otherwise continue heartbeats indefinitely. A recovered job reuses its saved PNG. If a paid image request was sent but its result remains unknown and no saved PNG exists, recovery sets `NEEDS_ATTENTION` rather than issuing another paid request; inspect it before explicitly authorizing `allowImageRetry=true`.

- The standard queue can redeliver messages. The worker claims jobs through conditional DynamoDB updates, sets a 180-second visibility timeout on receive (overriding the queue's 120-second default), and extends it with heartbeats. Start with one worker process per GPU.
- Monitor DLQ depth, oldest queued message, Lambda errors, and worker journal logs. A poison message reaches the DLQ after five receives; investigate before redriving it. No alarms or automatic GPU scaling are included.
- Stop the GPU instance when unused to stop compute charges; EBS, retained data, NAT and other services can still incur charges. Stopping during a paid image request can leave an uncertain external outcome; inspect the job before authorizing a fresh image attempt.
- Both S3 buckets, the job table and generated API-token secret are retained when the stack is deleted. Delete retained resources separately only when their data is no longer needed. The stack does not clean up a manually launched worker.
- Changing an S3 ZIP in place does not reliably trigger a Lambda code update. Deploy with a new `ApiCodeKey`; changing `WorkerCodeKey` only changes download permissions, so install the matching worker artifact as a deliberate host update.
- Secret rotation needs attention to process caches: restart the worker after changing the OpenAI secret and refresh Lambda execution environments after changing the API bearer secret.

## Dependency licenses

Original TRELLIS models and most code carry MIT terms, but its dependencies have separate licenses. In particular, the default [nvdiffrast license](https://github.com/NVlabs/nvdiffrast/blob/main/LICENSE.txt) limits use to non-commercial research or evaluation, and other rasterization modules require their own review. This installation recipe is **not an unrestricted commercial-use stack**. Review the exact installed revisions and obtain suitable permissions or replacements before commercial deployment.
