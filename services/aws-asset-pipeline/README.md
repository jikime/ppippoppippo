# AWS static character asset worker

This package implements a durable OpenAI image → original Microsoft TRELLIS → GLB job path. It has not been deployed or run on a GPU. Actual character anatomy, face quality, rear geometry and texture seams require inspection after generation. Output is a **static mesh: no rig and no animation**.

`api.py` is the Python 3.12 Lambda entry point. `worker.py` runs in the original TRELLIS Python 3.10 GPU environment. `template.yaml` and `bootstrap-worker.sh` prepare cloud resources and a manually selected EC2 host; see [DEPLOYMENT.md](DEPLOYMENT.md). Run those only when deployment and its charges are authorized.

## HTTP contract

Every route requires `Authorization: Bearer <application token>`. This token is generated in Secrets Manager. OpenAI keys and AWS credentials remain on the server/instance role.

| Method and path | Result |
| --- | --- |
| GET `/health` | `{ok:true,service:"static-character-jobs",rigged:false,animated:false}` |
| POST `/jobs` | Create or reconcile one UUID; 202 while queued/running |
| GET `/jobs/{id}` | Native job fields, status, progress and optional image URL |
| POST `/jobs/{id}/retry` | Explicitly retry FAILED or NEEDS_ATTENTION |
| GET `/jobs/{id}/model` | `{url,expiresIn:900,format:"glb",rigged:false,animated:false}` after success |

Create body:

```json
{"requestId":"12345678-1234-4234-8234-123456789012","characterId":"adult-casual","prompt":"Fully clothed adult in a teal jacket","seed":17,"quality":"standard","heightMeters":1.72}
```

Body limit is 16 KiB; prompt limit is 800 characters. Seed is uint32 and controls TRELLIS, not OpenAI image reproducibility. Quality is `standard`/`high`: OpenAI `medium`/`high`, texture atlas 1024/2048. Height is 1.0–2.3 meters. The source must depict one isolated, fully clothed person and respect the supplied age; a three-person style-reference montage is unsuitable. GLBs are normalized to Y-up, requested height and feet at y=0. Human facing direction is not inferred or guaranteed; inspect and adjust `forwardYaw` in the viewer.

Jobs expose both `state` and the identical `status` alias. States are `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `NEEDS_ATTENTION`. Stages are `image`, `geometry`, `export`; successful jobs finish at `export`, progress 100. Errors are objects with `code` and `message`. Internal lease tokens and the prompt hash are not exposed.

## Retry and billing behavior

- A UUID is bound to normalized parameters. Repeating create with different input returns 409; identical input returns the existing job.
- Failed SQS enqueue leaves a durable `NOT_QUEUED` job. A 503 response instructs the client to retry the same UUID. Duplicate deliveries are guarded by attempt number and a DynamoDB lease. A client must not replace the UUID to recover a transport error.
- The worker records `imageRequestState=SENT` before the single paid HTTP call. It saves the PNG in S3 before mesh generation. A crash after S3 upload is recovered from the deterministic object key.
- If the paid request outcome is unknown and no saved PNG exists, the job becomes `NEEDS_ATTENTION`. There is no automatic paid retry.
- Retry reuses a saved image. Without one, `POST /jobs/{id}/retry` requires `{"allowImageRetry":true}`; this explicitly permits another paid image request. Attempt count and recent attempt history are retained.
- Before advancing an attempt, retry checks its deterministic S3 image key and records a late-saved image for reuse. The API role has `s3:ListBucket` on the dedicated assets bucket so an absent image returns 404. A genuine 403 or another uncertain lookup fails closed and cannot authorize a fresh paid request.
- Queue/lease heartbeats run every 30 seconds with a 180-second visibility/lease window. One worker processes one message at a time.

The API outbox is reconciled by client retry, not an autonomous sweeper. A client that abandons a saved `NOT_QUEUED` job leaves it pending. SQS DLQ cases require operator review. Secrets are cached for the process lifetime; rotate/restart processes when changing them.

A hung CUDA call can keep renewing its lease; there is no GPU task watchdog. Through SSM, stop `asset-worker` with `sudo systemctl stop asset-worker`. The service allows 90 seconds for shutdown, then systemd terminates the remaining process. Diagnose/fix the GPU or host, and restart the service. Allow the last 180-second lease/visibility window to expire so the queue can redeliver the job. The recovered worker reuses a saved image; if an earlier paid image request has an unknown outcome and no image was saved, it enters `NEEDS_ATTENTION` and does not automatically repeat the paid call. Inspect the job before choosing any explicit image retry.

## Tests

```sh
python -m unittest -v test_pipeline.py
python -m py_compile api.py worker.py
```

The tests replace AWS clients and the image HTTP call; they do not invoke any paid API. Tests cover UUID idempotency, parameter conflict, enqueue recovery, auth and validation, explicit image retry, saved-image reuse, model readiness and the image-request ambiguity guard. Native CUDA builds, AWS IAM/schema behavior, CloudFront, model downloads and GPU output remain unverified.

## Upstream dependencies and licensing

Original [TRELLIS](https://github.com/microsoft/TRELLIS) documents Linux and an NVIDIA GPU with at least 16 GB VRAM, tested on A100/A6000. Its setup targets PyTorch 2.4.0/CUDA 11.8 and compiles native dependencies. The public model and DINOv2 download path need no Hugging Face access token. `rembg` uses public U2Net and is skipped for genuine input alpha. Prefer matching the documented compiler/runtime instead of assuming the latest Deep Learning AMI packages are compatible.

The top-level TRELLIS model/code is MIT, with dependency exceptions. [nvdiffrast's license](https://raw.githubusercontent.com/NVlabs/nvdiffrast/main/LICENSE.txt) restricts non-NVIDIA use to noncommercial research/evaluation; other native submodules also have separate terms. This package does **not** claim the entire generation stack is commercially cleared. Review or replace/license affected dependencies before commercial deployment. No automatic rigging is supplied by the upstream inference/export path.

The input request uses the officially documented [OpenAI Images API](https://developers.openai.com/api/reference/resources/images/methods/generate), model `gpt-image-2.5-sunburst`, transparent PNG, 1024×1536. Account access and billing were not tested.
