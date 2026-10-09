"""One-at-a-time SQS worker: OpenAI PNG -> original TRELLIS -> static GLB.

No image POST is automatically repeated after an ambiguous outcome. The DynamoDB
SENT marker is written before the paid request; subsequent delivery either finds
the saved S3 image or stops in NEEDS_ATTENTION. Explicit API retry is required.
"""
import base64
import json
import os
from pathlib import Path
import signal
import struct
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from decimal import Decimal

import boto3

IMAGE_MODEL = 'gpt-image-2.5-sunburst'
LEASE_SECONDS = 180
HEARTBEAT_SECONDS = 30
MAX_IMAGE_RESPONSE = 64 * 1024 * 1024
_PIPELINE = None
_OPENAI_KEY = None
STOP = threading.Event()


class WorkError(Exception):
    def __init__(self, code, message, attention=False):
        self.code, self.message, self.attention = code, message, attention
        super().__init__(message)


class LostLease(Exception):
    pass


def _conditional(exc):
    return getattr(exc, 'response', {}).get('Error', {}).get('Code') == 'ConditionalCheckFailedException'


def _missing(exc):
    return str(getattr(exc, 'response', {}).get('Error', {}).get('Code')) in ('404', 'NoSuchKey', 'NotFound')


def _log(event, job_id=None, **fields):
    print(json.dumps({'event': event, 'jobId': job_id, **fields}, separators=(',', ':')), flush=True)


def _json_default(value):
    return float(value) if isinstance(value, Decimal) else str(value)


def _key_from_secret(client):
    global _OPENAI_KEY
    if _OPENAI_KEY is None:
        value = client.get_secret_value(SecretId=os.environ['OPENAI_SECRET_ARN'])['SecretString']
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            parsed = value
        _OPENAI_KEY = parsed.get('apiKey') if isinstance(parsed, dict) else parsed
        if not isinstance(_OPENAI_KEY, str) or not _OPENAI_KEY.strip():
            raise WorkError('OPENAI_SECRET_INVALID', 'OpenAI secret must be a key string or JSON with apiKey.')
    return _OPENAI_KEY


class Lease:
    def __init__(self, worker, job, receipt):
        self.worker, self.job, self.receipt = worker, job, receipt
        self.owner = str(uuid.uuid4())
        self.stop_event = threading.Event()
        self.lost = threading.Event()
        self.thread = None

    def claim(self):
        now = int(time.time())
        try:
            result = self.worker.table.update_item(
                Key={'id': self.job['id']},
                UpdateExpression='SET #s=:running, workerToken=:owner, leaseExpiresAt=:lease, '
                                 'updatedAt=:now, startedAt=if_not_exists(startedAt,:now), enqueueState=:enqueued',
                ConditionExpression='attempt=:attempt AND (#s=:queued OR (#s=:running AND leaseExpiresAt < :now))',
                ExpressionAttributeNames={'#s': 'state'},
                ExpressionAttributeValues={':running': 'RUNNING', ':queued': 'QUEUED', ':attempt': self.job['attempt'],
                                           ':owner': self.owner, ':lease': now + LEASE_SECONDS,
                                           ':now': now, ':enqueued': 'ENQUEUED'}, ReturnValues='ALL_NEW')
        except Exception as exc:
            if _conditional(exc):
                return False
            raise
        self.job = result['Attributes']
        self.thread = threading.Thread(target=self._heartbeat, daemon=True)
        self.thread.start()
        return True

    def check(self):
        if self.lost.is_set():
            raise LostLease('Job lease was lost')

    def update(self, **fields):
        self.check()
        fields['updatedAt'] = int(time.time())
        names = {'#owner': 'workerToken', '#attempt': 'attempt', '#state': 'state'}
        values = {':owner': self.owner, ':attempt': self.job['attempt'], ':running': 'RUNNING'}
        assignments = []
        for index, (key, value) in enumerate(fields.items()):
            name, token = f'#f{index}', f':v{index}'
            names[name], values[token] = key, value
            assignments.append(f'{name}={token}')
        try:
            self.worker.table.update_item(
                Key={'id': self.job['id']}, UpdateExpression='SET ' + ', '.join(assignments),
                ConditionExpression='#owner=:owner AND #attempt=:attempt AND #state=:running',
                ExpressionAttributeNames=names, ExpressionAttributeValues=values)
        except Exception as exc:
            if _conditional(exc):
                self.lost.set()
                raise LostLease('Job lease was lost') from exc
            raise
        self.job.update(fields)

    def _heartbeat(self):
        while not self.stop_event.wait(HEARTBEAT_SECONDS):
            try:
                self.update(leaseExpiresAt=int(time.time()) + LEASE_SECONDS)
                self.worker.queue.change_message_visibility(
                    QueueUrl=self.worker.queue_url, ReceiptHandle=self.receipt,
                    VisibilityTimeout=LEASE_SECONDS)
            except Exception:
                # Stop new stages if lease renewal cannot be confirmed. An in-flight
                # paid response is still uploaded to its deterministic S3 key.
                self.lost.set()
                _log('heartbeat_lost', self.job['id'])
                return

    def close(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=5)


class Worker:
    def __init__(self):
        self.table = boto3.resource('dynamodb').Table(os.environ['JOBS_TABLE'])
        self.queue, self.s3, self.secrets = (boto3.client(name) for name in ('sqs', 's3', 'secretsmanager'))
        self.bucket = os.environ['ASSETS_BUCKET']
        self.queue_url = os.environ['JOBS_QUEUE_URL']
        self.work_dir = Path(os.environ.get('WORK_DIR', '/var/lib/crowd-assets/jobs'))
        self.work_dir.mkdir(parents=True, exist_ok=True)

    def _exists(self, key):
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception as exc:
            if _missing(exc):
                return False
            raise

    def _image(self, lease, folder, prefix):
        job = lease.job
        image_path = folder / 'input.png'
        key = job.get('imageKey') or prefix + '/input.png'
        # Recover a successfully saved image even if a crash occurred before its
        # DynamoDB acknowledgement. No new OpenAI call is involved.
        if self._exists(key):
            self.s3.download_file(self.bucket, key, str(image_path))
            lease.update(imageKey=key, imageRequestState='SAVED', stage='geometry', progress=30)
            return image_path
        if job.get('imageKey'):
            raise WorkError('SAVED_IMAGE_MISSING', 'The recorded image is missing from S3.', attention=True)
        if job.get('imageRequestState') in ('SENT', 'AMBIGUOUS'):
            raise WorkError('IMAGE_OUTCOME_UNKNOWN', 'Previous image request may have been billed; no saved image was found.', attention=True)
        api_key = _key_from_secret(self.secrets)
        prompt = (
            'Generate one realistic fully clothed person as a full-body 3D asset reference. '
            'Respect the supplied age and use age-appropriate anatomy and clothing. '
            'Show the entire head, hands and shoes, neutral A-pose, arms clear of the torso, fingers visible, '
            'feet apart, centered with a margin. Physically believable anatomy and detailed cloth. '
            'Transparent background, no floor, no shadows detached from the person, no text, no logos, '
            'no additional people, no props. Character description: ' + job['prompt']
        )
        body = json.dumps({'model': IMAGE_MODEL, 'prompt': prompt, 'n': 1, 'size': '1024x1536',
                           'quality': 'high' if job['quality'] == 'high' else 'medium',
                           'background': 'transparent', 'output_format': 'png'}).encode('utf-8')
        lease.update(imageRequestState='SENT', imageRequestedAt=int(time.time()), stage='image', progress=10)
        request = urllib.request.Request('https://api.openai.com/v1/images/generations', data=body,
                                         headers={'Authorization': 'Bearer ' + api_key, 'Content-Type': 'application/json'},
                                         method='POST')
        # Deliberately ONE network attempt, no HTTP retry library/idempotency claim.
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                raw = response.read(MAX_IMAGE_RESPONSE + 1)
            if len(raw) > MAX_IMAGE_RESPONSE:
                raise ValueError('Image response too large')
            document = json.loads(raw)
            image_bytes = base64.b64decode(document['data'][0]['b64_json'], validate=True)
            if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('Not a PNG response')
        except urllib.error.HTTPError as exc:
            ambiguous = exc.code >= 500 or exc.code == 408
            if not ambiguous:
                lease.update(imageRequestState='REJECTED')
            raise WorkError('IMAGE_HTTP_ERROR', f'Image provider returned HTTP {exc.code}.', attention=ambiguous) from exc
        except Exception as exc:
            raise WorkError('IMAGE_OUTCOME_UNKNOWN', 'Image request outcome is uncertain; inspect before authorizing a new paid request.', attention=True) from exc
        image_path.write_bytes(image_bytes)
        # Preserve the paid result even if the lease expired while HTTP was in flight.
        # Retry S3 writes only; this never repeats image generation.
        for attempt in range(3):
            try:
                self.s3.upload_file(str(image_path), self.bucket, key,
                                    ExtraArgs={'ContentType': 'image/png', 'ServerSideEncryption': 'AES256'})
                break
            except Exception as exc:
                if attempt == 2:
                    raise WorkError('IMAGE_SAVE_UNCONFIRMED', 'Paid image returned but saving it to S3 could not be confirmed.', attention=True) from exc
                time.sleep(2 ** attempt)
        lease.update(imageKey=key, imageRequestState='SAVED', stage='geometry', progress=30)
        return image_path

    def _mesh(self, lease, image_path, folder):
        global _PIPELINE
        lease.check()
        trellis_root = os.environ.get('TRELLIS_ROOT', '/opt/TRELLIS')
        if trellis_root not in sys.path:
            sys.path.insert(0, trellis_root)
        os.environ.setdefault('SPCONV_ALGO', 'native')
        from PIL import Image
        import numpy as np
        from trellis.pipelines import TrellisImageTo3DPipeline
        from trellis.utils import postprocessing_utils
        if _PIPELINE is None:
            lease.update(stage='geometry', progress=35)
            candidate = TrellisImageTo3DPipeline.from_pretrained('microsoft/TRELLIS-image-large')
            candidate.cuda()
            _PIPELINE = candidate
        lease.update(stage='geometry', progress=45)
        with Image.open(image_path) as source:
            image = source.copy()
        outputs = _PIPELINE.run(image, seed=int(lease.job['seed']), formats=['gaussian', 'mesh'])
        lease.update(stage='export', progress=65)
        texture_size = 2048 if lease.job['quality'] == 'high' else 1024
        glb_mesh = postprocessing_utils.to_glb(outputs['gaussian'][0], outputs['mesh'][0],
                                             simplify=0.95, texture_size=texture_size)
        # Official TRELLIS to_glb already rotates from Z-up to glTF Y-up.
        # Scale that result and move its feet to y=0, centered on the X/Z axes.
        bounds = np.asarray(glb_mesh.bounds)
        if len(glb_mesh.vertices) == 0 or len(glb_mesh.faces) == 0 or not np.isfinite(bounds).all():
            raise WorkError('INVALID_GEOMETRY', 'Generated mesh has no finite geometry.')
        extent = float(bounds[1, 1] - bounds[0, 1])
        if extent <= 1e-6:
            raise WorkError('INVALID_GEOMETRY', 'Generated mesh has zero height.')
        glb_mesh.apply_scale(float(lease.job['heightMeters']) / extent)
        bounds = np.asarray(glb_mesh.bounds)
        glb_mesh.apply_translation([-(bounds[0, 0] + bounds[1, 0]) / 2, -bounds[0, 1],
                                   -(bounds[0, 2] + bounds[1, 2]) / 2])
        model_path = folder / 'model.glb'
        glb_mesh.export(str(model_path))
        with model_path.open('rb') as handle:
            header = handle.read(12)
        if len(header) != 12:
            raise WorkError('INVALID_GLB', 'Exported GLB is incomplete.')
        magic, version, length = struct.unpack('<4sII', header)
        if magic != b'glTF' or version != 2 or length != model_path.stat().st_size:
            raise WorkError('INVALID_GLB', 'Exported GLB failed header validation.')
        return model_path, {'triangles': int(len(glb_mesh.faces)), 'textureSize': texture_size,
                            'bounds': np.asarray(glb_mesh.bounds).tolist()}

    def _run(self, lease):
        job = lease.job
        prefix = f"jobs/{job['id']}/attempt-{int(job['attempt'])}"
        model_key, manifest_key = prefix + '/model.glb', prefix + '/manifest.json'
        folder = self.work_dir / job['id'] / str(int(job['attempt']))
        folder.mkdir(parents=True, exist_ok=True)
        # Both objects are written before completion. Recover a crash after upload.
        if self._exists(manifest_key) and self._exists(model_key):
            saved = json.loads(self.s3.get_object(Bucket=self.bucket, Key=manifest_key)['Body'].read(64 * 1024))
            if saved.get('jobId') == job['id'] and int(saved.get('attempt', -1)) == int(job['attempt']):
                lease.update(state='SUCCEEDED', stage='export', progress=100, modelKey=model_key,
                             manifestKey=manifest_key, triangles=int(saved['triangles']),
                             finishedAt=int(time.time()), rigged=False, animated=False)
                return
        image_path = self._image(lease, folder, prefix)
        model_path, details = self._mesh(lease, image_path, folder)
        lease.update(stage='export', progress=90)
        manifest = {'version': 1, 'jobId': job['id'], 'characterId': job['characterId'],
                    'attempt': int(job['attempt']), 'generator': 'microsoft/TRELLIS-image-large',
                    'imageModel': IMAGE_MODEL, 'seed': int(job['seed']), 'quality': job['quality'],
                    'format': 'glb', 'upAxis': 'Y', 'units': 'meters', 'feetOrigin': True,
                    'heightMeters': float(job['heightMeters']), 'rigged': False, 'animated': False,
                    'assetType': 'static-mesh', 'humanQualityReviewed': False,
                    'frontDirectionVerified': False, 'requiresForwardYawReview': True,
                    'modelKey': model_key, 'imageKey': lease.job['imageKey'], **details}
        self.s3.upload_file(str(model_path), self.bucket, model_key,
                            ExtraArgs={'ContentType': 'model/gltf-binary', 'ServerSideEncryption': 'AES256'})
        self.s3.put_object(Bucket=self.bucket, Key=manifest_key,
                           Body=json.dumps(manifest, default=_json_default).encode('utf-8'),
                           ContentType='application/json', ServerSideEncryption='AES256')
        lease.update(state='SUCCEEDED', stage='export', progress=100, modelKey=model_key,
                     manifestKey=manifest_key, triangles=details['triangles'],
                     finishedAt=int(time.time()), rigged=False, animated=False)

    def process(self, message):
        try:
            body = json.loads(message['Body'])
            job_id = str(uuid.UUID(body['jobId']))
            attempt = int(body['attempt'])
        except (KeyError, ValueError, TypeError):
            _log('invalid_message')
            return True
        job = self.table.get_item(Key={'id': job_id}, ConsistentRead=True).get('Item')
        if not job or int(job['attempt']) != attempt or job['state'] in ('SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION'):
            return True
        lease = Lease(self, job, message['ReceiptHandle'])
        if not lease.claim():
            return False
        terminal = False
        try:
            _log('job_started', job_id, attempt=attempt)
            self._run(lease)
            terminal = True
            _log('job_succeeded', job_id, attempt=attempt)
        except LostLease:
            _log('job_lease_lost', job_id, attempt=attempt)
        except Exception as exc:
            unknown_image = not lease.job.get('imageKey') and lease.job.get('imageRequestState') in ('SENT', 'AMBIGUOUS')
            attention = unknown_image or (isinstance(exc, WorkError) and exc.attention)
            code = exc.code if isinstance(exc, WorkError) else 'WORKER_STAGE_FAILED'
            explanation = exc.message if isinstance(exc, WorkError) else 'Worker stage failed. Inspect host logs and retry the same job explicitly.'
            state = 'NEEDS_ATTENTION' if attention else 'FAILED'
            changes = {'state': state, 'finishedAt': int(time.time()),
                       'error': {'code': code, 'message': explanation, 'stage': lease.job.get('stage', 'unknown')}}
            if unknown_image:
                changes['imageRequestState'] = 'AMBIGUOUS'
            try:
                lease.update(**changes)
                terminal = True
                _log('job_failed', job_id, state=state, code=code, attempt=attempt,
                     errorType=type(exc).__name__, stage=lease.job.get('stage'))
            except Exception:
                _log('failure_status_unconfirmed', job_id, attempt=attempt)
        finally:
            lease.close()
        return terminal

    def loop(self):
        while not STOP.is_set():
            try:
                result = self.queue.receive_message(QueueUrl=self.queue_url, MaxNumberOfMessages=1,
                                                    WaitTimeSeconds=20, VisibilityTimeout=LEASE_SECONDS)
                for message in result.get('Messages', []):
                    if self.process(message):
                        self.queue.delete_message(QueueUrl=self.queue_url, ReceiptHandle=message['ReceiptHandle'])
            except Exception:
                _log('poll_or_process_error')
                STOP.wait(5)


def main():
    # Graceful signal: finish the active job, then stop polling.
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *_: STOP.set())
    Worker().loop()


if __name__ == '__main__':
    main()
