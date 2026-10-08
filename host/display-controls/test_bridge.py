"""Linux socket integration and authentication without hardware or a broker."""
import hashlib
import hmac
import json
import socket
import tempfile
import threading
import unittest
import uuid
from pathlib import Path
import bridge
import config
import install_bridge
import receiver


class BridgeTests(unittest.TestCase):
    def test_auth_replay_ranges_and_no_power_controls(self):
        calls = []
        state = dict(brightness=50, idle_timeout=15, automatic_blanking=False, persistence_ok=False, display_on=True)
        def request(command):
            calls.append(command)
            return state
        service = bridge.ScreenService('a'*64, request, lambda: 1800000000)
        def dispatch(body='', method='GET', request_id=None, timestamp='1800000000', token='a'*64):
            rid = request_id or str(uuid.uuid4())
            signature = hmac.new(token.encode(), '\n'.join([method,'/screen',timestamp,rid,body]).encode(), hashlib.sha256).hexdigest()
            return service.dispatch(method, '/screen', {'X-Power-Time':timestamp,'X-Power-Id':rid,'X-Power-Signature':signature}, body)
        rid = str(uuid.uuid4())
        code, result = dispatch(request_id=rid)
        self.assertEqual(code, 200)
        self.assertFalse(result['persistence_ok'])
        self.assertNotIn('display_on', result)
        self.assertEqual(dispatch(request_id=rid)[0],409)
        self.assertEqual(dispatch(timestamp='1700000000')[0],401)
        self.assertEqual(dispatch(token='b'*64)[0],401)
        for action, value in [('sleep',True),('wake',True),('brightness',9),('brightness',True),('idle_timeout',1.5),('automatic_blanking',1)]:
            self.assertEqual(dispatch(json.dumps(dict(action=action,value=value)), 'POST')[0],400)
        self.assertEqual(len(calls),1)
        service.request = lambda command: (_ for _ in ()).throw(OSError('private path'))
        self.assertEqual(dispatch(),(503,{}))

    def test_unix_transport_app_and_mqtt_share_authoritative_state_without_broker(self):
        with tempfile.TemporaryDirectory() as directory, socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM) as server:
            path = str(Path(directory)/'display.sock')
            server.bind(path)
            state = dict(ok=True,brightness=75,idle_timeout=15,automatic_blanking=False,persistence_ok=True,display_on=True)
            errors=[]
            def serve():
                try:
                    for _ in range(5):
                        data,address=server.recvfrom(2048)
                        command=json.loads(data)
                        if command['action']!='status':
                            state[command['action']]=command['value']
                        server.sendto(json.dumps(state).encode(),address)
                except Exception as error:
                    errors.append(error)
            server.settimeout(3)
            worker=threading.Thread(target=serve);worker.start()
            event='radar-test-'+uuid.uuid4().hex
            # No listening adapter/broker: the local command still succeeds.
            self.assertEqual(bridge.controller_request(path,event,dict(action='brightness',value=42))['brightness'],42)
            from unittest.mock import patch
            with patch.object(receiver.host_config,'socket_path',return_value=path):
                self.assertEqual(receiver.request(dict(action='status'))['brightness'],42)
                receiver.request(dict(action='idle_timeout',value=27))
            self.assertEqual(bridge.controller_request(path,event,dict(action='status'))['idle_timeout'],27)
            # Reconnected adapter receives only a hint, then can reread the state.
            with socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM) as adapter:
                adapter.bind('\0'+event);adapter.settimeout(1)
                bridge.controller_request(path,event,dict(action='automatic_blanking',value=True))
                self.assertEqual(adapter.recv(64),b'changed')
            worker.join(4);self.assertFalse(worker.is_alive());self.assertEqual(errors,[])

    def test_local_config_and_scoped_bridge_definition(self):
        local=dict(device_id='radar_test',output='DSI-1',backlight='/sys/class/backlight/panel')
        self.assertEqual(config.validate(local),local)
        with self.assertRaises((KeyError,ValueError)):
            config.validate(local,require_mqtt=True)
        self.assertEqual(install_bridge.definition('tester',1234,'/run/user/1234/existing.sock','existing-events')['events_address'],'existing-events')
        for path in ['/run/user/0/display.sock','/tmp/display.sock','/run/user/1234/../display.sock']:
            with self.assertRaises(ValueError):
                install_bridge.definition('tester',1234,path,'')
        unit=install_bridge.unit('tester')
        self.assertIn('User=tester\n',unit);self.assertIn('LoadCredential=token:',unit)
        self.assertIn('CapabilityBoundingSet=\n',unit)
        self.assertNotIn('AF_INET',unit)
        self.assertIn('create_host_path: false',install_bridge.compose(123))


if __name__=='__main__':
    unittest.main()
