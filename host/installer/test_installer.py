"""Installer contracts and interrupted-run recovery; no host changes or network."""
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import installer as app


class InstallerTests(unittest.TestCase):
    def test_progress_resets_column_when_terminal_newline_mapping_is_disabled(self):
        import pty
        import termios
        master, slave = pty.openpty()
        try:
            settings = termios.tcgetattr(slave)
            settings[1] &= ~termios.OPOST
            termios.tcsetattr(slave, termios.TCSANOW, settings)
            with os.fdopen(os.dup(slave), 'w') as terminal, patch.object(app.sys, 'stdout', terminal):
                app.progress(10)
                app.progress(20)
            self.assertEqual(os.read(master, 4096),
                             b'\r  Still working... 10s elapsed.\r\n\r  Still working... 20s elapsed.\r\n')
        finally:
            os.close(master)
            os.close(slave)

    def test_package_commands_disable_dpkg_terminal(self):
        instance = app.Installer.__new__(app.Installer)
        instance.run = Mock()
        instance.apt('Update', 'full-upgrade', '-y')
        self.assertIn('Dpkg::Use-Pty=0', instance.run.call_args.args)

    def fixture(self, root):
        instance = app.Installer.__new__(app.Installer)
        instance.directory = root / 'state'
        instance.directory.mkdir()
        instance.path = instance.directory / 'install.json'
        instance.state = {'files': {}, 'power': False, 'mqtt': False}
        instance.boot = 'new-boot'
        instance.app = root / 'app'
        instance.args = SimpleNamespace(reconfigure=False)
        return instance

    def test_only_target_os_and_boards(self):
        for board in ('Raspberry Pi 4 Model B Rev 1.5', 'Raspberry Pi 5 Model B Rev 1.0'):
            app.supported_host({'VERSION_CODENAME': 'trixie'}, board, 'arm64', True, True)
        for values in [({'VERSION_CODENAME': 'bookworm'}, 'Raspberry Pi 5 Model B', 'arm64', True, True),
                       ({'VERSION_CODENAME': 'trixie'}, 'Generic PC', 'arm64', True, True),
                       ({'VERSION_CODENAME': 'trixie'}, 'Raspberry Pi 5 Model B', 'amd64', True, True),
                       ({'VERSION_CODENAME': 'trixie'}, 'Raspberry Pi 5 Model B', 'arm64', False, True),
                       ({'VERSION_CODENAME': 'trixie'}, 'Raspberry Pi 5 Model B', 'arm64', True, False)]:
            with self.subTest(values=values), self.assertRaises(app.Stop):
                app.supported_host(*values)

    def test_parse_realistic_wlr_and_display_constraints(self):
        text = '''DSI-2 "DSI display"
  Enabled: yes
  Modes:
    720x1280 px, 60.000000 Hz (preferred, current)
  Transform: 270
HDMI-A-1 "HDMI"
  Enabled: no
'''
        found = app.outputs(text)
        self.assertEqual(found, [dict(name='DSI-2', mode='720x1280', enabled=True, transform='270')])
        app.select_display(found, 'Raspberry Pi 4 Model B')
        found[0]['mode'] = '1200x1920'
        with self.assertRaises(app.Stop):
            app.select_display(found, 'Raspberry Pi 4 Model B')
        app.select_display(found, 'Raspberry Pi 5 Model B')
        with self.assertRaises(app.Stop):
            app.select_display(found * 2, 'Raspberry Pi 5 Model B')
        found[0]['name'] = 'HDMI-A-1'
        with self.assertRaises(app.Stop):
            app.select_display(found, 'Raspberry Pi 5 Model B')

    def test_release_is_digest_and_source_pinned(self):
        manifest = json.loads((Path(__file__).parent / 'release.json').read_text())
        app.validate_release(manifest)
        self.assertEqual(manifest['app_release'], 'v0.8.0')
        for key, value in [('app_digest', 'latest'), ('app_commit', 'main'), ('app_release', 'latest')]:
            changed = dict(manifest, **{key: value})
            with self.assertRaises(app.Stop):
                app.validate_release(changed)

    def test_runner_refresh_does_not_require_changing_application(self):
        manifest = json.loads((Path(__file__).parent / 'release.json').read_text())
        updated = dict(manifest, installer_version='0.1.0-test.2')
        self.assertEqual(app.release_identity(manifest), app.release_identity(updated))
        updated['app_digest'] = 'sha256:' + '0' * 64
        self.assertNotEqual(app.release_identity(manifest), app.release_identity(updated))

    def test_initial_flow_stops_at_reboot_before_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.log = Path(directory) / 'test.log'
            instance.args = SimpleNamespace(check=False, reconfigure=False)
            instance.preflight, instance.orientation = Mock(), Mock()
            instance.upgrade, instance.docker = Mock(return_value=False), Mock()
            instance.main()
            instance.orientation.assert_called_once()
            instance.docker.assert_not_called()

    def test_completed_rerun_only_checks_without_reinstalling(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.log = Path(directory) / 'test.log'
            instance.state['complete'] = True
            instance.args = SimpleNamespace(check=False, reconfigure=False)
            instance.preflight, instance.checks, instance.upgrade = Mock(), Mock(), Mock()
            instance.main()
            instance.checks.assert_called_once()
            instance.upgrade.assert_not_called()

    def test_os_upgrade_requires_reboot_and_is_not_repeated_after_boot(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.apt, instance.reboot, instance.capture = Mock(), Mock(), Mock(return_value='')
            self.assertFalse(instance.upgrade())
            self.assertEqual(instance.apt.call_count, 2)
            self.assertEqual(json.loads(instance.path.read_text())['upgrade_boot'], 'new-boot')
            instance.apt.reset_mock()
            self.assertFalse(instance.upgrade())
            instance.apt.assert_not_called()
            instance.boot = 'another-boot'
            self.assertTrue(instance.upgrade())
            instance.apt.assert_not_called()

    def test_failed_upgrade_does_not_record_success(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.apt = Mock(side_effect=app.Stop('apt failed'))
            with self.assertRaises(app.Stop):
                instance.upgrade()
            self.assertNotIn('upgrade_boot', instance.state)

    def test_unfinished_dpkg_configuration_does_not_record_success(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.apt = Mock()
            instance.capture = Mock(return_value='Unconfigured package')
            with self.assertRaises(app.Stop):
                instance.upgrade()
            self.assertNotIn('upgrade_boot', instance.state)

    def test_owned_write_survives_interruption_without_adopting_user_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instance = self.fixture(root)
            target = root / 'config'
            instance.owned(target, 'first')
            # Interrupt only target replacement, after state journal was written.
            real_atomic = app.atomic
            def interrupted(path, data, mode=0o600):
                if path == target:
                    raise OSError('simulated interrupted write')
                return real_atomic(path, data, mode)
            with patch.object(app, 'atomic', side_effect=interrupted), self.assertRaises(OSError):
                instance.owned(target, 'second')
            self.assertEqual(target.read_text(), 'first')
            instance.state = json.loads(instance.path.read_text())
            instance.owned(target, 'second')
            self.assertEqual(target.read_text(), 'second')
            target.write_text('personal edits')
            with self.assertRaises(app.Stop):
                instance.owned(target, 'third')
            self.assertEqual(target.read_text(), 'personal edits')

    def test_only_empty_or_comment_only_display_config_can_be_adopted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instance = self.fixture(root)
            target = root / 'kanshi'
            target.write_text('# default empty display config\n\n')
            instance.owned(target, 'new display profile', allow_empty=True)
            self.assertEqual(len(list((instance.directory / 'backups').iterdir())), 1)
            unowned = root / 'other-config'
            unowned.write_text('custom rules')
            with self.assertRaises(app.Stop):
                instance.owned(unowned, 'replacement', allow_empty=True)

    def test_symlink_target_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            instance = self.fixture(root)
            actual = root / 'actual'
            actual.write_text('keep')
            link = root / 'link'
            link.symlink_to(actual)
            with self.assertRaises(app.Stop):
                instance.owned(link, 'replace')
            self.assertEqual(actual.read_text(), 'keep')

    def test_declined_or_failed_mqtt_is_not_marked_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.state.update(mqtt=True, display={'output': 'DSI-2'})
            instance.apt = Mock()
            instance.run = Mock(side_effect=app.Stop('setup declined'))
            with self.assertRaises(app.Stop):
                instance.mqtt()
            self.assertNotIn('mqtt_ready', instance.state)

    def test_unselected_options_have_no_installation_effects(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.run, instance.apt = Mock(), Mock()
            instance.power()
            instance.mqtt()
            instance.run.assert_not_called()
            instance.apt.assert_not_called()

    def test_mismatched_release_download_stops(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.release = {'app_commit': 'a' * 40, 'files': {'compose.yaml': 'b' * 64}}
            instance.download = Mock(return_value=b'wrong content')
            with self.assertRaises(app.Stop):
                instance.release_file('compose.yaml')

    def test_unexpected_compose_override_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.app.mkdir()
            override = instance.app / 'compose.override.yml'
            override.write_text('custom override')
            with self.assertRaises(app.Stop):
                instance.application()
            self.assertEqual(override.read_text(), 'custom override')


if __name__ == '__main__':
    unittest.main()
