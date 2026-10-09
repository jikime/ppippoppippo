"""Offline tests. AWS and OpenAI are stubbed; no network calls or GPU needed."""
import copy
import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.modules.setdefault('boto3', types.ModuleType('boto3'))
import api
import worker


class ConditionalFailure(Exception):
    response = {'Error': {'Code': 'ConditionalCheckFailedException'}}


class Table:
    def __init__(self):
        self.items = {}

    def put_item(self, Item, **kwargs):
        if Item['id'] in self.items:
            raise ConditionalFailure()
        self.items[Item['id']] = copy.deepcopy(Item)

    def get_item(self, Key, **kwargs):
        return {'Item': copy.deepcopy(self.items[Key['id']])} if Key['id'] in self.items else {}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues,
                    ExpressionAttributeNames=None, ConditionExpression='', **kwargs):
        item = self.items[Key['id']]
        values, names = ExpressionAttributeValues, ExpressionAttributeNames or {}
        if ':oldState' in values and (item['state'] != values[':oldState'] or item['attempt'] != values[':oldAttempt']):
            raise ConditionalFailure()
        if ':queued' in values and item['state'] != values[':queued']:
            raise ConditionalFailure()
        assignments, _, removals = UpdateExpression.partition(' REMOVE ')
        for assignment in assignments.removeprefix('SET ').split(', '):
            name, value = assignment.split('=')
            item[names.get(name, name)] = copy.deepcopy(values[value])
        for name in removals.split(', '):
            item.pop(names.get(name, name), None)
        return {'Attributes': copy.deepcopy(item)}


class Queue:
    def __init__(self):
        self.messages, self.fail = [], False

    def send_message(self, **kwargs):
        if self.fail:
            raise RuntimeError('offline simulated outage')
        self.messages.append(json.loads(kwargs['MessageBody']))


class S3:
    def __init__(self):
        self.objects = set()
        self.head_error = None

    def head_object(self, Bucket, Key):
        if self.head_error is not None:
            raise self.head_error
        if Key not in self.objects:
            failure = RuntimeError('Object not found')
            failure.response = {'Error': {'Code': '404'}}
            raise failure
        return {'ContentType': 'image/png'}

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        return 'https://private.s3.amazonaws.com/' + Params['Key'] + '?offline-signature'


class ApiTests(unittest.TestCase):
    def setUp(self):
        api.TABLE, api.QUEUE, api.S3 = Table(), Queue(), S3()
        api._API_TOKEN = 't' * 48
        os.environ['JOBS_QUEUE_URL'] = 'https://sqs.us-east-1.amazonaws.com/123/queue'
        os.environ['ASSETS_BUCKET'] = 'test-private'
        self.job_id = '12345678-1234-4234-8234-123456789012'
        self.payload = {'requestId': self.job_id, 'characterId': 'adult-casual', 'prompt': 'Adult in teal jacket',
                        'seed': 17, 'quality': 'standard', 'heightMeters': 1.72}

    def call(self, method, path, payload=None, token=None, raw=None):
        result = api.lambda_handler({'requestContext': {'http': {'method': method}}, 'rawPath': path,
            'headers': {'Authorization': 'Bearer ' + (token if token is not None else 't' * 48)},
            'body': raw if raw is not None else json.dumps(payload or {})}, None)
        return result['statusCode'], json.loads(result['body'])

    def create(self):
        return self.call('POST', '/jobs', self.payload)

    def test_create_idempotent_and_status_alias(self):
        status, body = self.create()
        self.assertEqual(status, 202)
        self.assertEqual(body['state'], 'QUEUED')
        self.assertEqual(body['status'], 'QUEUED')
        self.assertEqual(body['enqueueState'], 'ENQUEUED')
        self.create()
        self.assertEqual(len(api.TABLE.items), 1)
        self.assertEqual(len(api.QUEUE.messages), 1)

    def test_same_uuid_different_input_conflicts(self):
        self.create()
        self.payload['prompt'] = 'Different adult'
        status, result = self.create()
        self.assertEqual(status, 409)
        self.assertEqual(result['error']['code'], 'IDEMPOTENCY_CONFLICT')

    def test_enqueue_failure_saved_and_reconciled(self):
        api.QUEUE.fail = True
        status, body = self.create()
        self.assertEqual(status, 503)
        self.assertEqual(body['error']['code'], 'ENQUEUE_PENDING')
        self.assertEqual(api.TABLE.items[self.job_id]['enqueueState'], 'NOT_QUEUED')
        api.QUEUE.fail = False
        self.assertEqual(self.create()[0], 202)
        self.assertEqual(len(api.QUEUE.messages), 1)

    def test_auth_and_invalid_body(self):
        self.assertEqual(self.call('GET', '/health', token='wrong')[0], 401)
        self.assertEqual(self.call('GET', '/health', token='잘못된토큰')[0], 401)
        self.assertEqual(self.call('GET', '/health')[0], 200)
        self.assertEqual(self.call('POST', '/jobs', raw='x' * 16385)[0], 413)
        self.assertEqual(self.call('POST', '/jobs', raw='[]')[0], 400)

    def test_validation(self):
        for field, value in [('requestId', 'nope'), ('prompt', 'x' * 801), ('seed', True),
                             ('seed', -1), ('seed', 2 ** 32), ('quality', 'ultra'),
                             ('heightMeters', 0.9), ('heightMeters', 2.31)]:
            with self.subTest(field=field, value=value):
                body = dict(self.payload, **{field: value})
                self.assertEqual(self.call('POST', '/jobs', body)[0], 400)

    def test_ambiguous_image_needs_explicit_opt_in(self):
        self.create()
        item = api.TABLE.items[self.job_id]
        item.update(state='NEEDS_ATTENTION', imageRequestState='AMBIGUOUS', error={'code': 'IMAGE_OUTCOME_UNKNOWN'})
        path = '/jobs/' + self.job_id + '/retry'
        status, body = self.call('POST', path, {})
        self.assertEqual(status, 409)
        self.assertEqual(body['error']['code'], 'IMAGE_RETRY_REQUIRES_OPT_IN')
        status, body = self.call('POST', path, {'allowImageRetry': True})
        self.assertEqual(status, 202)
        self.assertEqual(body['attempt'], 2)
        self.assertEqual(body['imageRequestState'], 'NOT_STARTED')
        self.assertEqual(len(item['attempts']), 1)
        self.assertNotIn('error', item)

    def test_saved_image_retry_reuses_image(self):
        self.create()
        item = api.TABLE.items[self.job_id]
        item.update(state='FAILED', stage='geometry', imageKey='jobs/old/input.png', imageRequestState='SAVED')
        status, body = self.call('POST', '/jobs/' + self.job_id + '/retry')
        self.assertEqual(status, 202)
        self.assertEqual(body['stage'], 'geometry')
        self.assertEqual(body['progress'], 30)
        self.assertIn('old/input.png', body['imageUrl'])

    def test_retry_recovers_late_paid_image_from_previous_attempt(self):
        self.create()
        item = api.TABLE.items[self.job_id]
        item.update(state='NEEDS_ATTENTION', imageRequestState='AMBIGUOUS')
        recovered_key = f'jobs/{self.job_id}/attempt-1/input.png'
        api.S3.objects.add(recovered_key)
        self.assertNotIn('imageKey', item)
        # No allowImageRetry opt-in: the already paid source must be reused.
        status, body = self.call('POST', '/jobs/' + self.job_id + '/retry', {})
        self.assertEqual(status, 202)
        self.assertEqual(item['imageKey'], recovered_key)
        self.assertEqual(body['attempt'], 2)
        self.assertEqual(body['imageRequestState'], 'SAVED')
        self.assertEqual(body['stage'], 'geometry')
        self.assertIn('attempt-1/input.png', body['imageUrl'])
        self.assertEqual(item['attempts'][0]['imageKey'], recovered_key)

    def test_retry_storage_403_never_authorizes_fresh_image(self):
        self.create()
        item = api.TABLE.items[self.job_id]
        item.update(state='NEEDS_ATTENTION', imageRequestState='AMBIGUOUS')
        denied = RuntimeError('Forbidden')
        denied.response = {'Error': {'Code': '403'}}
        api.S3.head_error = denied
        status, body = self.call('POST', '/jobs/' + self.job_id + '/retry', {'allowImageRetry': True})
        self.assertEqual(status, 503)
        self.assertEqual(body['error']['code'], 'IMAGE_LOOKUP_UNCONFIRMED')
        self.assertEqual(item['attempt'], 1)
        self.assertEqual(item['state'], 'NEEDS_ATTENTION')
        self.assertEqual(len(api.QUEUE.messages), 1)

    def test_model_requires_actual_success_and_hides_internal_fields(self):
        self.create()
        path = '/jobs/' + self.job_id
        self.assertEqual(self.call('GET', path + '/model')[0], 409)
        item = api.TABLE.items[self.job_id]
        item.update(state='SUCCEEDED', modelKey='jobs/one/model.glb', workerToken='internal-token', specHash='private-hash')
        status, model = self.call('GET', path + '/model')
        self.assertEqual(status, 200)
        self.assertTrue(model['url'].startswith('https://'))
        self.assertFalse(model['rigged'])
        status, job = self.call('GET', path)
        self.assertNotIn('workerToken', job)
        self.assertNotIn('specHash', job)


class FakeLease:
    def __init__(self, state):
        self.job = {'id': 'id', 'attempt': 1, 'prompt': 'Adult', 'quality': 'standard',
                    'imageRequestState': state}
        self.updates = []

    def update(self, **fields):
        self.updates.append(fields)
        self.job.update(fields)


class WorkerGuardTests(unittest.TestCase):
    def make_worker(self):
        result = worker.Worker.__new__(worker.Worker)
        result._exists = lambda key: False
        result.secrets = object()
        result.bucket = 'offline'
        return result

    def test_ambiguous_redelivery_never_calls_openai(self):
        value, lease = self.make_worker(), FakeLease('SENT')
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(worker.urllib.request, 'urlopen') as network:
            with self.assertRaises(worker.WorkError) as caught:
                value._image(lease, Path(directory), 'jobs/id/attempt-1')
            self.assertTrue(caught.exception.attention)
            network.assert_not_called()

    def test_sent_marker_precedes_single_paid_attempt(self):
        value, lease = self.make_worker(), FakeLease('NOT_STARTED')
        def network(request, **kwargs):
            self.assertEqual(lease.job['imageRequestState'], 'SENT')
            payload = json.loads(request.data)
            self.assertEqual(payload['background'], 'transparent')
            self.assertEqual(payload['size'], '1024x1536')
            raise TimeoutError('simulated ambiguous timeout')
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(worker, '_key_from_secret', return_value='offline-key'), \
                mock.patch.object(worker.urllib.request, 'urlopen', side_effect=network) as call:
            with self.assertRaises(worker.WorkError) as caught:
                value._image(lease, Path(directory), 'jobs/id/attempt-1')
            self.assertTrue(caught.exception.attention)
            self.assertEqual(call.call_count, 1)
            with self.assertRaises(worker.WorkError):
                value._image(lease, Path(directory), 'jobs/id/attempt-1')
            self.assertEqual(call.call_count, 1)


if __name__ == '__main__':
    unittest.main()
