"""Focused protocol and timing tests; no MQTT/HA or hardware mutations."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

root = Path(__file__).resolve().parent
controller = load('controller', root / 'controller.py' if (root / 'controller.py').exists() else root.parent / 'screen-idle/controller.py')
receiver = load('receiver', root / 'receiver.py')
receiver.configure({'device_id': 'pi_rain_radar_test'})
controller.OUTPUT = 'DSI-1'

class DisplayTests(unittest.TestCase):
    def test_blanking_off_preserves_manual_sleep_and_touch_wake(self):
        for resume in ('activity', 'wake'):
            policy = controller.Policy(60, 0, True)
            policy.event('idle', 1)
            self.assertFalse(policy.awake(61))
            policy.set_blanking(False, 62)
            self.assertTrue(policy.awake(10000))
            policy.event('sleep', 10001)
            policy.event('idle', 10002)
            self.assertFalse(policy.awake(10003))
            policy.set_blanking(True, 10004)
            policy.set_blanking(False, 10005)
            self.assertFalse(policy.awake(10006))
            policy.event(resume, 10007)
            self.assertTrue(policy.awake(20000))

    def test_reenable_starts_full_interval_and_duplicate_does_not_extend(self):
        policy = controller.Policy(60, 0, False)
        policy.event('idle', 1)
        policy.set_blanking(True, 100)
        self.assertTrue(policy.awake(159))
        policy.set_blanking(True, 150)
        self.assertFalse(policy.awake(160))
        policy.event('activity', 161)
        self.assertTrue(policy.awake(10000))

    def test_boolean_validation_and_fresh_default(self):
        self.assertFalse(controller.Policy(60, 0).automatic_blanking)
        self.assertTrue(controller.Policy(60, 0, True).automatic_blanking)
        for value in (0, 1, None, 'ON', 'false', []):
            with self.subTest(value=value), self.assertRaises(ValueError):
                controller.Policy(60, 0, True).set_blanking(value, 1)

    def test_switch_protocol_and_discovery(self):
        now = datetime.now(timezone.utc)
        for value in (True, False, 0, 1, 'ON', None):
            payload = json.dumps(dict(schema=1, action='automatic_blanking',
                source='home-assistant', value=value, sent_at=now.isoformat())).encode()
            if type(value) is bool:
                self.assertIs(receiver.decode(receiver.BASE+'/automatic_blanking/set', payload, False, now)['value'], value)
            else:
                with self.assertRaises(ValueError):
                    receiver.decode(receiver.BASE+'/automatic_blanking/set', payload, False, now)
        config = receiver.discovery()['homeassistant/switch/pi_rain_radar_test/automatic_blanking/config']
        self.assertFalse(config['optimistic'])
        self.assertEqual(config['state_topic'], receiver.BASE+'/automatic_blanking/state')

    def test_ha_switch_template_produces_valid_boolean_commands(self):
        from jinja2 import Environment
        now = datetime.now(timezone.utc)
        config = receiver.discovery()['homeassistant/switch/pi_rain_radar_test/automatic_blanking/config']
        template = Environment().from_string(config['command_template'])
        for value, expected in [('ON', True), ('OFF', False)]:
            payload = template.render(value=value, now=lambda: now).encode()
            self.assertIs(receiver.decode(config['command_topic'], payload, False, now)['value'], expected)

    def test_switch_state_requires_boolean(self):
        for value in (None, 0, 'OFF'):
            with self.assertRaises(ValueError):
                receiver.state_values(dict(brightness=42, idle_timeout=15,
                    display_on=True, automatic_blanking=value))

    def test_sleep_expires_both_sources_until_new_activity(self):
        for resume in ('activity', 'wake'):
            policy = controller.Policy(300, 0, True)
            policy.event('wake', 10)
            policy.event('sleep', 11)
            self.assertFalse(policy.awake(11))
            self.assertEqual(policy.seconds, 300)
            # A pending idle notification is not new input and must not wake it.
            policy.event('idle', 12)
            self.assertFalse(policy.awake(12))
            policy.seconds = 7200
            self.assertFalse(policy.awake(13))
            policy.event(resume, 14)
            self.assertTrue(policy.awake(14))
            policy.event('idle', 15)
            self.assertFalse(policy.awake(7214))

    def test_touch_and_wake_deadlines(self):
        policy = controller.Policy(60, 0, True)
        policy.event('idle', 1)
        self.assertFalse(policy.awake(61))
        policy.event('wake', 70)
        self.assertTrue(policy.awake(100))
        policy.event('wake', 110)
        self.assertTrue(policy.awake(169))
        self.assertFalse(policy.awake(170))
        policy.event('activity', 171)
        self.assertTrue(policy.awake(300))  # Continuous activity.
        policy.event('idle', 301)
        self.assertTrue(policy.awake(359))
        self.assertFalse(policy.awake(360))

    def test_timeout_changes_existing_deadline(self):
        policy = controller.Policy(900, 0, True)
        policy.event('idle', 1)
        policy.event('wake', 10)
        policy.seconds = 60
        self.assertFalse(policy.awake(71))
        policy.seconds = 1200
        self.assertTrue(policy.awake(71))

    def test_quantization_and_limits(self):
        self.assertEqual(controller.raw_brightness(48, 31), 15)
        self.assertEqual(controller.raw_brightness(10, 31), 3)
        self.assertEqual(controller.raw_brightness(100, 31), 31)
        for value in (0, 101, True, '50', float('nan'), float('inf')):
            with self.subTest(value=value), self.assertRaises(ValueError):
                controller.raw_brightness(value, 31)

    def test_protocol(self):
        now = datetime.now(timezone.utc)
        def command(action, **extra):
            return json.dumps({'schema':1,'action':action,'source':'home-assistant',
                               'sent_at':now.isoformat(), **extra}).encode()
        for topic, action in receiver.COMMANDS.items():
            value = {'value':15} if action in ('brightness','idle_timeout') else {}
            if action == 'automatic_blanking':
                value = {'value': True}
            self.assertEqual(receiver.decode(topic, command(action, **value), False, now)['action'], action)
            with self.assertRaises(ValueError):
                receiver.decode(topic, command(action, **value), True, now)
        topic = receiver.BASE + '/idle_timeout/set'
        for value in (0, 121, 1.5, True, '15'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                receiver.decode(topic, command('idle_timeout', value=value), False, now)
        for offset in (-61, 6):
            with self.assertRaises(ValueError):
                receiver.decode(receiver.BASE+'/wake', command('wake', sent_at=(now+timedelta(seconds=offset)).isoformat()), False, now)
        for payload in (b'[]', b'null', b'{', b'"wake"'):
            with self.assertRaises((ValueError, TypeError)):
                receiver.decode(receiver.BASE+'/wake', payload, False, now)

    def test_discovery_contract(self):
        configs = receiver.discovery()
        self.assertEqual(len(configs), 6)
        self.assertEqual(len({c['unique_id'] for c in configs.values()}), 6)
        for config in configs.values():
            self.assertEqual(config['device']['identifiers'], ['pi_rain_radar_test'])
            if 'command_topic' in config:
                self.assertFalse(config['retain'])
                self.assertIn('now().isoformat()', config['command_template'])
        sensor = configs['homeassistant/binary_sensor/pi_rain_radar_test/screen_on/config']
        self.assertEqual(sensor['state_topic'], receiver.BASE + '/screen_on/state')
        self.assertEqual(sensor['availability_topic'], receiver.BASE + '/availability')

    def test_power_readback(self):
        for output, expected in [('DSI-1 on\n', True), ('DSI-1 off\n', False)]:
            with patch.object(controller.subprocess, 'run', return_value=SimpleNamespace(stdout=output)):
                self.assertIs(controller.display_state(), expected)
        for output in ('', 'HDMI-A-1 on\n', 'DSI-1 unknown\n'):
            with patch.object(controller.subprocess, 'run', return_value=SimpleNamespace(stdout=output)):
                with self.assertRaises(OSError):
                    controller.display_state()

    def test_screen_state_requires_boolean(self):
        for power, expected in [(True, 'ON'), (False, 'OFF')]:
            self.assertEqual(receiver.state_values(dict(brightness=42, idle_timeout=5, display_on=power, automatic_blanking=True)), (42, 5, expected, 'ON'))
        for power in (None, 'off', 0):
            with self.assertRaises(ValueError):
                receiver.state_values(dict(brightness=42, idle_timeout=5, display_on=power, automatic_blanking=True))

    def test_missing_adapter_does_not_block_local_control(self):
        with patch.object(controller.socket, 'AF_UNIX', 1, create=True), patch.object(controller.socket, 'socket', side_effect=OSError):
            controller.notify_display()

if __name__ == '__main__':
    unittest.main()
