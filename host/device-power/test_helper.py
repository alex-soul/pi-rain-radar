import hashlib
import hmac
import json
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path
from helper import PowerService


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.time = 1800000000
        self.token = 'a' * 64
        self.calls = []
        self.database = str(Path(self.temp.name) / 'requests.sqlite')
        self.service = self.create()

    def create(self):
        service = PowerService(self.token, self.database, action=self.calls.append, clock=lambda: self.time)
        self.addCleanup(service.db.close)
        return service

    def signed(self, method='POST', path='/power', body=None, request_id=None):
        body = json.dumps({'action': 'restart'}) if body is None else body
        headers = {'X-Power-Time': str(self.time), 'X-Power-Id': request_id or str(uuid.uuid4())}
        signed = '\n'.join([method, path, headers['X-Power-Time'], headers['X-Power-Id'], body])
        headers['X-Power-Signature'] = hmac.new(self.token.encode(), signed.encode(), hashlib.sha256).hexdigest()
        return method, path, headers, body

    def test_actions_replay_and_restart(self):
        request = self.signed()
        self.assertEqual(self.service.dispatch(*request)[0], 202)
        self.assertEqual(self.calls, ['restart'])
        self.assertEqual(self.service.dispatch(*request)[0], 409)
        self.service = self.create()
        self.assertEqual(self.service.dispatch(*request)[0], 409)
        self.assertEqual(self.service.dispatch(*self.signed(body='{"action":"shutdown"}'))[0], 409)
        self.time += 121
        self.assertEqual(self.service.dispatch(*self.signed(body='{"action":"shutdown"}'))[0], 202)
        self.assertEqual(self.calls, ['restart', 'shutdown'])

    def test_auth_expiry_tampering_and_unknown_commands(self):
        request = self.signed()
        self.assertEqual(self.service.dispatch(request[0], request[1], request[2], '{"action":"shutdown"}')[0], 401)
        self.time += 31
        self.assertEqual(self.service.dispatch(*request)[0], 401)
        for body in ['{', 'null', '{"action":"reboot; id"}', '{"action":"restart","command":"id"}']:
            self.assertEqual(self.service.dispatch(*self.signed(body=body))[0], 400)
        self.assertEqual(self.service.dispatch(*self.signed(path='/shell'))[0], 404)
        self.assertEqual(self.calls, [])

    def test_failure_not_success_and_reservation_survives(self):
        def fail(_):
            raise OSError('fake failure')
        self.service.action = fail
        self.assertEqual(self.service.dispatch(*self.signed())[0], 503)
        self.assertTrue(self.create().pending())

    def test_authenticated_status_never_runs_power(self):
        code, result = self.service.dispatch(*self.signed('GET', '/status', ''))
        self.assertEqual(code, 200)
        self.assertEqual(result['protocol'], 1)
        self.assertFalse(result['pending'])
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
