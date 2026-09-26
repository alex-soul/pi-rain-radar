"""Portable configuration and generated service contracts; no installation."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

import config
import receiver

spec = importlib.util.spec_from_file_location('display_setup', Path(__file__).with_name('setup.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    def settings(self):
        return dict(device_id='radar_one', output='DSI-2',
                    backlight='/sys/class/backlight/panel-backlight',
                    mqtt_host='broker.example', mqtt_port=1883, mqtt_tls=False)

    def test_valid_configuration_and_rejects_unit_injection(self):
        self.assertEqual(config.validate(self.settings())['output'], 'DSI-2')
        for key, values in {
            'device_id': ['../escape', 'bad/topic', 'bad\nName'],
            'output': ['HDMI-A-1', 'DSI-1\nExecStart=bad'],
            'backlight': ['/tmp/brightness', '/sys/class/backlight/../escape'],
            'mqtt_port': [True, 0, 65536, '1883'],
            'mqtt_tls': ['false', 0], 'mqtt_host': ['', '  '],
        }.items():
            for value in values:
                settings = self.settings()
                settings[key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    config.validate(settings)

    def test_two_installations_have_disjoint_discovery_and_commands(self):
        previous = receiver.DEVICE_ID
        try:
            receiver.configure({'device_id': 'radar_one'})
            first = receiver.discovery()
            commands = set(receiver.COMMANDS)
            receiver.configure({'device_id': 'radar_two'})
            second = receiver.discovery()
            self.assertEqual(len(second), 6)
            self.assertFalse(set(first) & set(second))
            self.assertFalse(commands & set(receiver.COMMANDS))
            self.assertFalse({c['unique_id'] for c in first.values()} &
                             {c['unique_id'] for c in second.values()})
            self.assertEqual({tuple(c['device']['identifiers']) for c in second.values()}, {('radar_two',)})
        finally:
            receiver.configure({'device_id': previous})

    def test_mqtt_service_uses_runtime_credentials_and_actual_uid(self):
        unit = setup.mqtt_unit('tester', 1234)
        self.assertIn('User=tester\n', unit)
        self.assertIn('/run/user/1234', unit)
        self.assertIn('LoadCredential=mqtt.json:', unit)
        self.assertIn('ProtectSystem=strict', unit)
        self.assertNotIn('password', unit)
        for username in ('root\nExecStart=bad', 'has space'):
            with self.assertRaises(ValueError):
                setup.mqtt_unit(username, 1234)

    def test_backlight_rule_is_scoped_to_detected_node_and_group(self):
        rule = setup.backlight_rule(self.settings()['backlight'], 1234)
        self.assertIn('KERNEL=="panel-backlight"', rule)
        self.assertIn('/bin/chgrp 1234 /sys%p/brightness', rule)
        self.assertIn('0660', rule)
        self.assertNotIn('*', rule)
        with self.assertRaises(ValueError):
            setup.backlight_rule('/sys/class/backlight/bad"name', 1234)

    def test_detected_output_used_for_start_and_recovery(self):
        unit = setup.user_unit('DSI-2')
        self.assertEqual(unit.count('wlopm --on DSI-2'), 2)
        self.assertNotIn('DSI-1', unit)

    def test_socket_and_event_addresses_use_actual_user(self):
        with patch.object(config.os, 'getuid', return_value=1234, create=True), patch.dict(config.os.environ, {}, clear=True):
            self.assertEqual(config.socket_path(), str(Path('/run/user/1234') / 'pi-rain-radar-display.sock'))
            self.assertTrue(config.events_address().endswith('-1234'))


if __name__ == '__main__':
    unittest.main()
