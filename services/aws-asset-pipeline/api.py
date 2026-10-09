"""Lambda HTTP API for durable, explicitly retried static-character jobs."""
import base64
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from decimal import Decimal

import boto3

TABLE = QUEUE = S3 = SECRETS = None
_API_TOKEN = None
MAX_BODY_BYTES = 16_384


class ClientError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


def _conditional(exc):
    return getattr(exc, 'response', {}).get('Error', {}).get('Code') == 'ConditionalCheckFailedException'


def _services():
    global TABLE, QUEUE, S3, SECRETS
    if TABLE is None:
        from botocore.config import Config
        TABLE = boto3.resource('dynamodb').Table(os.environ['JOBS_TABLE'])
        QUEUE = boto3.client('sqs')
        S3 = boto3.client('s3', config=Config(signature_version='s3v4'))
        SECRETS = boto3.client('secretsmanager')


def _token():
    global _API_TOKEN
    if _API_TOKEN is None:
        secret = SECRETS.get_secret_value(SecretId=os.environ['API_TOKEN_SECRET_ARN'])['SecretString']
        try:
            parsed = json.loads(secret)
        except json.JSONDecodeError:
            parsed = secret
        _API_TOKEN = parsed.get('apiToken') if isinstance(parsed, dict) else parsed
        if not isinstance(_API_TOKEN, str) or len(_API_TOKEN) < 24:
            raise RuntimeError('Invalid API token secret')
    return _API_TOKEN


def _authorize(event):
    headers = {key.lower(): value for key, value in (event.get('headers') or {}).items()}
    supplied = headers.get('authorization', '')
    if not supplied.startswith('Bearer ') or not hmac.compare_digest(supplied[7:].encode('utf-8'), _token().encode('utf-8')):
        raise ClientError(401, 'UNAUTHORIZED', 'A valid bearer token is required.')


def _body(event):
    raw = event.get('body') or '{}'
    if not isinstance(raw, str) or len(raw) > 22_000:
        raise ClientError(413, 'BODY_TOO_LARGE', 'Body must not exceed 16 KiB.')
    try:
        data = base64.b64decode(raw, validate=True) if event.get('isBase64Encoded') else raw.encode('utf-8')
        if len(data) > MAX_BODY_BYTES:
            raise ClientError(413, 'BODY_TOO_LARGE', 'Body must not exceed 16 KiB.')
        parsed = json.loads(data)
    except (ValueError, UnicodeError) as exc:
        raise ClientError(400, 'INVALID_JSON', 'Expected a UTF-8 JSON object.') from exc
    if not isinstance(parsed, dict):
        raise ClientError(400, 'INVALID_JSON', 'Expected a JSON object.')
    return parsed


def _job_id(value):
    try:
        parsed = uuid.UUID(value) if isinstance(value, str) else None
    except ValueError:
        parsed = None
    if parsed is None:
        raise ClientError(400, 'INVALID_REQUEST_ID', 'requestId must be a UUID.')
    return str(parsed)


def _validate(payload):
    job_id = _job_id(payload.get('requestId'))
    character_id = payload.get('characterId')
    if not isinstance(character_id, str) or not 1 <= len(character_id) <= 100:
        raise ClientError(400, 'INVALID_CHARACTER_ID', 'characterId must contain 1 to 100 characters.')
    prompt = payload.get('prompt')
    if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 800:
        raise ClientError(400, 'INVALID_PROMPT', 'prompt must contain 1 to 800 characters.')
    seed = payload.get('seed', 1)
    if type(seed) is not int or not 0 <= seed <= 4_294_967_295:
        raise ClientError(400, 'INVALID_SEED', 'seed must be an unsigned 32-bit integer.')
    quality = payload.get('quality', 'standard')
    if quality not in ('standard', 'high'):
        raise ClientError(400, 'INVALID_QUALITY', 'quality must be standard or high.')
    height = payload.get('heightMeters', 1.75)
    if type(height) not in (int, float) or not 1.0 <= height <= 2.3:
        raise ClientError(400, 'INVALID_HEIGHT', 'heightMeters must be between 1.0 and 2.3.')
    spec = dict(characterId=character_id, prompt=prompt.strip(), seed=seed,
                quality=quality, heightMeters=Decimal(str(height)))
    return job_id, spec


def _json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(type(value).__name__)


def _response(status, payload):
    return {'statusCode': status, 'headers': {'content-type': 'application/json', 'cache-control': 'no-store'},
            'body': json.dumps(payload, default=_json_default, separators=(',', ':'))}


def _get(job_id):
    item = TABLE.get_item(Key={'id': job_id}, ConsistentRead=True).get('Item')
    if item is None:
        raise ClientError(404, 'NOT_FOUND', 'Job does not exist.')
    return item


def _signed(key):
    return S3.generate_presigned_url('get_object', Params={'Bucket': os.environ['ASSETS_BUCKET'], 'Key': key}, ExpiresIn=900)


def _public(item):
    fields = ('id', 'characterId', 'state', 'stage', 'progress', 'attempt', 'createdAt',
              'updatedAt', 'startedAt', 'finishedAt', 'quality', 'heightMeters', 'error',
              'enqueueState', 'rigged', 'animated', 'triangles', 'imageRequestState')
    result = {key: item[key] for key in fields if key in item}
    result['requestId'] = item['id']
    result['status'] = item['state']  # explicit alias for clients that use status
    result['allowImageRetryRequired'] = not bool(item.get('imageKey')) and item['state'] in ('FAILED', 'NEEDS_ATTENTION')
    if item.get('imageKey'):
        result['imageUrl'] = _signed(item['imageKey'])
    return result


def _enqueue(item):
    # Standard SQS may duplicate delivery; the worker claims each attempt using a lease.
    # Keep NOT_QUEUED on failure so the same POST can safely retry the outbox operation.
    try:
        QUEUE.send_message(QueueUrl=os.environ['JOBS_QUEUE_URL'],
                           MessageBody=json.dumps({'jobId': item['id'], 'attempt': int(item['attempt'])}))
    except Exception as exc:
        raise ClientError(503, 'ENQUEUE_PENDING', 'Job was saved. Retry the same requestId to enqueue it.') from exc
    try:
        TABLE.update_item(Key={'id': item['id']},
                          UpdateExpression='SET enqueueState=:enqueued, updatedAt=:now',
                          ConditionExpression='#s=:queued AND attempt=:attempt',
                          ExpressionAttributeNames={'#s': 'state'},
                          ExpressionAttributeValues={':enqueued': 'ENQUEUED', ':now': int(time.time()),
                                                     ':queued': 'QUEUED', ':attempt': item['attempt']})
    except Exception as exc:
        if not _conditional(exc):
            # Queue delivery already succeeded. Return an explicit retryable result;
            # a later duplicate enqueue is safe under worker attempt/lease checks.
            raise ClientError(503, 'ENQUEUE_ACK_PENDING', 'Job was queued. Retry the same requestId to reconcile status.') from exc


def _create(payload):
    job_id, spec = _validate(payload)
    fingerprint = hashlib.sha256(json.dumps(spec, sort_keys=True, default=_json_default).encode()).hexdigest()
    now = int(time.time())
    item = dict(spec, id=job_id, specHash=fingerprint, state='QUEUED', stage='image', progress=0,
                attempt=1, attempts=[], enqueueState='NOT_QUEUED', imageRequestState='NOT_STARTED',
                createdAt=now, updatedAt=now, rigged=False, animated=False)
    created = True
    try:
        TABLE.put_item(Item=item, ConditionExpression='attribute_not_exists(id)')
    except Exception as exc:
        if not _conditional(exc):
            raise
        created = False
        item = _get(job_id)
        if item.get('specHash') != fingerprint:
            raise ClientError(409, 'IDEMPOTENCY_CONFLICT', 'This requestId belongs to different input parameters.')
    if item['state'] == 'QUEUED' and item.get('enqueueState') == 'NOT_QUEUED':
        _enqueue(item)
        item = _get(job_id)
    return _response(202 if created or item['state'] in ('QUEUED', 'RUNNING') else 200, _public(item))


def _retry(job_id, payload):
    item = _get(job_id)
    allow_image = payload.get('allowImageRetry', False)
    if type(allow_image) is not bool:
        raise ClientError(400, 'INVALID_RETRY_FLAG', 'allowImageRetry must be a boolean.')
    if item['state'] == 'QUEUED' and item.get('enqueueState') == 'NOT_QUEUED':
        _enqueue(item)
        return _response(202, _public(_get(job_id)))
    if item['state'] not in ('FAILED', 'NEEDS_ATTENTION'):
        raise ClientError(409, 'NOT_RETRYABLE', 'Only FAILED or NEEDS_ATTENTION jobs can be retried.')
    # A paid image may reach S3 after the worker loses its lease, so imageKey may
    # never have been acknowledged in DynamoDB. Reconcile before permitting a
    # fresh image request or advancing the attempt prefix.
    if not item.get('imageKey'):
        recovered_key = f"jobs/{job_id}/attempt-{int(item['attempt'])}/input.png"
        try:
            S3.head_object(Bucket=os.environ['ASSETS_BUCKET'], Key=recovered_key)
        except Exception as exc:
            code = str(getattr(exc, 'response', {}).get('Error', {}).get('Code'))
            if code not in ('404', 'NoSuchKey', 'NotFound'):
                # S3 may return 403 for an absent key without ListBucket rights.
                # It is not proof of absence and must never enable another bill.
                raise ClientError(503, 'IMAGE_LOOKUP_UNCONFIRMED',
                                  'Saved image lookup could not be confirmed. Resolve storage access and retry this same job.') from exc
        else:
            try:
                TABLE.update_item(Key={'id': job_id},
                    UpdateExpression='SET #image=:image, #imageState=:saved, #updated=:now',
                    ConditionExpression='#s=:oldState AND #attempt=:oldAttempt',
                    ExpressionAttributeNames={'#image': 'imageKey', '#imageState': 'imageRequestState',
                                              '#updated': 'updatedAt', '#s': 'state', '#attempt': 'attempt'},
                    ExpressionAttributeValues={':image': recovered_key, ':saved': 'SAVED', ':now': int(time.time()),
                                               ':oldState': item['state'], ':oldAttempt': item['attempt']})
            except Exception as exc:
                if _conditional(exc):
                    raise ClientError(409, 'RETRY_CONFLICT', 'Job changed; fetch current status before retrying.') from exc
                raise
            item['imageKey'] = recovered_key
            item['imageRequestState'] = 'SAVED'
    has_image = bool(item.get('imageKey'))
    if not has_image and not allow_image:
        raise ClientError(409, 'IMAGE_RETRY_REQUIRES_OPT_IN',
                          'No saved image exists. Set allowImageRetry=true to authorize a new paid image request.')
    old_attempt = item['attempt']
    history = list(item.get('attempts', []))[-19:]
    history.append({key: item[key] for key in ('attempt', 'state', 'stage', 'startedAt', 'finishedAt', 'error', 'imageKey') if key in item})
    values = {':state': 'QUEUED', ':oldState': item['state'], ':oldAttempt': old_attempt,
              ':attempt': old_attempt + 1, ':history': history, ':stage': 'geometry' if has_image else 'image',
              ':progress': 30 if has_image else 0, ':enqueue': 'NOT_QUEUED', ':now': int(time.time()),
              ':imageState': 'SAVED' if has_image else 'NOT_STARTED'}
    try:
        TABLE.update_item(Key={'id': job_id},
            UpdateExpression='SET #s=:state, #attempt=:attempt, #history=:history, #stage=:stage, #progress=:progress, '
                             '#enqueue=:enqueue, #updated=:now, #imageState=:imageState '
                             'REMOVE #owner, #lease, #error, #started, #finished, #model, #manifest',
            ConditionExpression='#s=:oldState AND #attempt=:oldAttempt',
            ExpressionAttributeNames={'#s': 'state', '#attempt': 'attempt', '#history': 'attempts',
                '#stage': 'stage', '#progress': 'progress', '#enqueue': 'enqueueState', '#updated': 'updatedAt',
                '#imageState': 'imageRequestState', '#owner': 'workerToken', '#lease': 'leaseExpiresAt',
                '#error': 'error', '#started': 'startedAt', '#finished': 'finishedAt',
                '#model': 'modelKey', '#manifest': 'manifestKey'}, ExpressionAttributeValues=values)
    except Exception as exc:
        if _conditional(exc):
            raise ClientError(409, 'RETRY_CONFLICT', 'Job changed; fetch current status before retrying.') from exc
        raise
    item = _get(job_id)
    _enqueue(item)
    return _response(202, _public(_get(job_id)))


def lambda_handler(event, context):
    try:
        _services()
        _authorize(event)
        method = event.get('requestContext', {}).get('http', {}).get('method', '')
        path = event.get('rawPath', '').rstrip('/') or '/'
        if method == 'GET' and path == '/health':
            return _response(200, {'ok': True, 'service': 'static-character-jobs', 'rigged': False, 'animated': False})
        if method == 'POST' and path == '/jobs':
            return _create(_body(event))
        match = re.fullmatch(r'/jobs/([^/]+)(?:/(retry|model))?', path)
        if not match:
            raise ClientError(404, 'NOT_FOUND', 'Route does not exist.')
        job_id, action = _job_id(match.group(1)), match.group(2)
        if method == 'POST' and action == 'retry':
            return _retry(job_id, _body(event))
        if method == 'GET' and action is None:
            return _response(200, _public(_get(job_id)))
        if method == 'GET' and action == 'model':
            item = _get(job_id)
            if item['state'] != 'SUCCEEDED' or not item.get('modelKey'):
                raise ClientError(409, 'MODEL_NOT_READY', 'An actual GLB has not completed yet.')
            return _response(200, {'url': _signed(item['modelKey']), 'expiresIn': 900,
                                   'format': 'glb', 'rigged': False, 'animated': False})
        raise ClientError(405, 'METHOD_NOT_ALLOWED', 'Method is not allowed for this route.')
    except ClientError as exc:
        return _response(exc.status, {'error': {'code': exc.code, 'message': exc.message}})
    except Exception:
        # Never log secrets, authorization headers, prompts, or third-party response bodies.
        print(json.dumps({'event': 'api_error', 'requestId': getattr(context, 'aws_request_id', None)}))
        return _response(500, {'error': {'code': 'INTERNAL_ERROR', 'message': 'Request failed; retry using the same requestId.'}})
