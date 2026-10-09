"""Installer contracts and interrupted-run recovery; no host changes or network."""
import json
import io
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import installer as app


class InstallerTests(unittest.TestCase):
    def test_bootstrap_bundle_can_install_screen_bridge_without_repo_checkout(self):
        import re
        import shlex
        import shutil
        import subprocess
        root = Path(__file__).resolve().parents[2]
        bootstrap = (root / 'install-pi.sh').read_text()
        files = shlex.split(re.search(r'files=\((.*?)\)', bootstrap, re.S).group(1))
        with tempfile.TemporaryDirectory() as folder:
            bundle = Path(folder)
            for name in files:
                target = bundle / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(root / name, target)
            bridge = bundle / 'host/display-controls/install_bridge.py'
            result = subprocess.run([app.sys.executable, str(bridge), '--help'], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((bridge.parent / 'bridge.py').is_file())

    def test_progress_resets_column_when_terminal_newline_mapping_is_disabled(self):
        import pty
        import termios
        master, slave = pty.openpty()
        try:
            settings = termios.tcgetattr(slave)
            settings[1] &= ~termios.OPOST
            termios.tcsetattr(slave, termios.TCSANOW, settings)
            with os.fdopen(os.dup(slave), 'w') as terminal, patch.object(app.sys, 'stdout', terminal), \
                    patch.dict(os.environ, {'TERM': 'xterm', 'NO_COLOR': '1'}):
                ui = app.Terminal()
                ui.tick('Updating OS', 10)
                ui.tick('Updating OS', 20)
                ui.say('  OK')
            output = os.read(master, 4096)
            self.assertEqual(output, b'\r\x1b[2K  > Updating OS  0m 10s'
                             b'\r\x1b[2K  > Updating OS  0m 20s\r\x1b[2K  OK\r\n')
        finally:
            os.close(master)
            os.close(slave)

    def test_plain_stage_is_compact_and_failure_never_claims_success(self):
        output = io.StringIO()
        with patch.object(app.sys, 'stdout', output):
            ui = app.Terminal()
            with self.assertRaises(app.Stop), ui.stage('Prepare Docker'):
                ui.tick('Write internal file')
                ui.tick('Install Docker', 10)
                ui.tick('Install Docker', 60)
                raise app.Stop('package failure')
        text = output.getvalue()
        self.assertNotIn('\033', text)
        self.assertNotIn('Write internal', text)
        self.assertNotIn('10s', text)
        self.assertIn('Install Docker (60s elapsed)', text)
        self.assertIn('STOPPED', text)
        self.assertNotIn('OK', text)

    def test_live_progress_fits_narrow_terminal_and_command_is_copyable(self):
        output = io.StringIO()
        output.isatty = lambda: True
        with patch.object(app.sys, 'stdout', output), \
                patch.object(app.shutil, 'get_terminal_size', return_value=os.terminal_size((40, 24))), \
                patch.dict(os.environ, {'TERM': 'xterm', 'NO_COLOR': '1'}):
            ui = app.Terminal()
            ui.tick('Install a very long package description that would normally wrap', 120)
            status = output.getvalue().replace('\r\033[2K', '')
            self.assertLessEqual(len(status), 39)
            ui.command(app.RETRY)
        self.assertIn(app.RETRY + '\r\n', output.getvalue())

    def test_reboot_distinguishes_resume_from_finished_install(self):
        instance = app.Installer.__new__(app.Installer)
        instance.home = Path('/home/new-user')
        with patch.object(app, 'ask', return_value=False), \
                patch.object(app.socket, 'gethostname', return_value='new-pi'):
            resume, finished = io.StringIO(), io.StringIO()
            with patch.object(app.sys, 'stdout', resume):
                instance.reboot('OS ready')
            with patch.object(app.sys, 'stdout', finished):
                instance.reboot('Setup complete', complete=True)
        self.assertIn('ssh new-user@new-pi.local', resume.getvalue())
        self.assertIn('Once logged into the Pi', resume.getvalue())
        self.assertIn(app.RETRY, resume.getvalue())
        self.assertNotIn(app.RETRY, finished.getvalue())
        self.assertIn('No third setup run is needed', finished.getvalue())
        self.assertNotIn('paused', finished.getvalue())

    def test_failed_child_retains_log_and_visible_error_under_grouped_ui(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = app.Installer.__new__(app.Installer)
            instance.log = Path(directory) / 'failure.log'
            instance.env = os.environ.copy()
            output = io.StringIO()
            with patch.object(app.sys, 'stdout', output), patch.object(app, 'UI', app.Terminal()):
                with self.assertRaises(app.Stop), app.UI.stage('Install radar'):
                    instance.run('Download app', app.sys.executable, '-c',
                                 'import sys; print("simulated network failure"); sys.exit(3)')
            self.assertIn('simulated network failure', instance.log.read_text())
            self.assertIn('simulated network failure', output.getvalue())
            self.assertIn(str(instance.log), output.getvalue())
            self.assertNotIn('  OK', output.getvalue())

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
        self.assertEqual(manifest['app_release'], 'v0.11.0')
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
            instance.reboot = Mock()
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
            instance.summary = Mock()
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

    def test_screen_without_mqtt_and_resume_preserve_one_controller(self):
        with tempfile.TemporaryDirectory() as directory:
            instance = self.fixture(Path(directory))
            instance.home=Path(directory)
            instance.state.update(mqtt=False, display={'output':'DSI-2'})
            instance.run, instance.apt, instance.compose = Mock(), Mock(), Mock()
            instance.screen()
            calls = str(instance.run.call_args_list)
            self.assertIn('--local-only', calls)
            self.assertNotIn('paho', str(instance.apt.call_args_list))
            self.assertTrue(instance.state['screen_ready'])
            instance.run.reset_mock();instance.apt.reset_mock()
            instance.screen()
            instance.run.assert_not_called();instance.apt.assert_not_called()
            instance.state = {'mqtt_ready':True}
            instance.screen()
            self.assertNotIn('setup.py',str(instance.run.call_args_list))
            self.assertIn('install_bridge.py',str(instance.run.call_args_list))

    def test_screen_setup_failure_is_not_marked_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            instance=self.fixture(Path(directory))
            instance.home=Path(directory)
            instance.state={'mqtt_ready':True}
            instance.run=Mock(side_effect=app.Stop('bridge unavailable'))
            with self.assertRaises(app.Stop):
                instance.screen()
            self.assertNotIn('screen_ready',instance.state)

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
