#!/usr/bin/env python3
"""Guided fresh Raspberry Pi installation. No maintenance scheduler or HA admin."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent.parent
RETRY = 'curl -fsSL https://raw.githubusercontent.com/alex-soul/pi-rain-radar/main/install-pi.sh -o /tmp/pi-rain-radar-install.sh && bash /tmp/pi-rain-radar-install.sh'
MARKER = '# Managed by Pi Rain Radar installer\n'


class Stop(Exception):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic(path, data, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('wb') as handle:
        os.fchmod(handle.fileno(), mode)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def ask(text, default=False):
    while True:
        answer = input(text + (' [Y/n]: ' if default else ' [y/N]: ')).strip().lower()
        if not answer:
            return default
        if answer in ('y', 'yes', 'n', 'no'):
            return answer in ('y', 'yes')


def progress(elapsed):
    # Package tooling can temporarily disable the terminal's LF -> CRLF mapping.
    # Explicit column reset/newline also avoids wrapping a long log path repeatedly.
    print(f'\r  Still working... {elapsed}s elapsed.', end='\r\n', flush=True)


def os_info(text):
    return {key: value.strip('"') for line in text.splitlines()
            if '=' in line and not line.startswith('#') for key, value in [line.split('=', 1)]}


def supported_host(info, model, arch, pi_os, desktop):
    if not pi_os or info.get('VERSION_CODENAME') != 'trixie' or arch != 'arm64' or not desktop:
        raise Stop('Use Raspberry Pi OS 64-bit with Desktop (Trixie/labwc), not Lite or a generic Debian image.')
    if not model.startswith(('Raspberry Pi 4 Model B', 'Raspberry Pi 5 Model B')):
        raise Stop('This installer supports Raspberry Pi 4 Model B and Raspberry Pi 5 only.')


def outputs(text):
    result, current = [], None
    for line in text.splitlines():
        if line and not line[0].isspace():
            current = {'name': line.split()[0], 'enabled': False, 'transform': 'normal', 'mode': ''}
            result.append(current)
        elif current is not None:
            stripped = line.strip()
            if stripped == 'Enabled: yes':
                current['enabled'] = True
            if stripped.startswith('Transform:'):
                current['transform'] = stripped.split(':', 1)[1].strip()
            if re.search(r'\bcurrent\b', stripped):
                mode = re.search(r'\b\d+x\d+\b', stripped)
                if mode:
                    current['mode'] = mode.group()
    return [out for out in result if out['enabled']]


def select_display(found, model):
    if len(found) != 1 or not re.fullmatch(r'DSI-\d+', found[0]['name']):
        raise Stop('Connect only the official Touch Display 2 for installation; an active DSI output is required.')
    display = found[0]
    if display['mode'] not in ('720x1280', '1200x1920'):
        raise Stop('Only the official 7-inch and 10-inch Touch Display 2 modes are supported.')
    if display['mode'] == '1200x1920' and not model.startswith('Raspberry Pi 5 Model B'):
        raise Stop('The 10-inch Touch Display 2 requires Pi 5.')
    return display


def validate_release(release):
    if release.get('schema') != 1 or not re.fullmatch(r'v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?', release['app_release']):
        raise Stop('Invalid release manifest.')
    for field, pattern in [('app_commit', r'[0-9a-f]{40}'), ('app_digest', r'sha256:[0-9a-f]{64}')]:
        if not re.fullmatch(pattern, release[field]):
            raise Stop('Invalid release identity.')
    expected = {'compose.yaml', 'host/device-power/manage.sh', 'host/device-power/helper.py',
                'host/device-power/pi-rain-radar-power.service'}
    if set(release['files']) != expected or not all(re.fullmatch(r'[0-9a-f]{64}', sha) for sha in release['files'].values()):
        raise Stop('Invalid release file manifest.')
    return release


def release_identity(release):
    # Updating the runner must not implicitly select a different application.
    return {key: value for key, value in release.items() if key != 'installer_version'}


def can_replace(existing, intended, record, allow_empty=False):
    if existing is None or existing == intended:
        return True
    if record and digest(existing) in (record.get('before'), record.get('after'), record.get('previous')):
        return True
    return allow_empty and not any(line.strip() and not line.lstrip().startswith(b'#') for line in existing.splitlines())


class Installer:
    def __init__(self, args):
        self.args = args
        self.home = Path.home()
        self.directory = self.home / '.local/state/pi-rain-radar'
        self.path = self.directory / 'install.json'
        self.app = self.home / 'apps/pi-rain-radar'
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.log = self.directory / ('install-' + time.strftime('%Y%m%d-%H%M%S') + '.log')
        self.state = json.loads(self.path.read_text()) if self.path.exists() else {}
        self.release = validate_release(json.loads((HERE / 'release.json').read_text()))
        self.env = os.environ.copy()
        self.boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        self.model = Path('/proc/device-tree/model').read_text().rstrip('\0')

    def save(self):
        atomic(self.path, (json.dumps(self.state, indent=2) + '\n').encode())

    def capture(self, *command, required=True):
        result = subprocess.run(command, env=self.env, capture_output=True, text=True, timeout=30)
        if required and result.returncode:
            raise Stop('Command failed: ' + ' '.join(command) + '\n' + result.stderr[-1200:])
        return result.stdout.strip()

    def run(self, title, *command, interactive=False):
        print('\n' + title, flush=True)
        # Never log interactive MQTT configuration, terminal input or passwords.
        if command[0] == 'sudo':
            subprocess.run(['sudo', '-v'], check=True)
        if interactive:
            subprocess.run(command, check=True, env=self.env)
            return
        with self.log.open('a', encoding='utf-8') as log:
            log.write('\n' + title + '\n')
            log.flush()
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log,
                                     stderr=subprocess.STDOUT, env=self.env)
            started = time.monotonic()
            try:
                while True:
                    try:
                        code = child.wait(timeout=10)
                        break
                    except subprocess.TimeoutExpired:
                        progress(int(time.monotonic() - started))
            except BaseException:
                child.terminate()
                child.wait()
                raise
        if code:
            lines = self.log.read_text(encoding='utf-8', errors='replace').splitlines()
            print('\n'.join(lines[-15:]))
            raise Stop(title + ' failed. Resolve the error and rerun the same command; completed checkpoints are kept.')
        print('  OK', flush=True)

    def apt(self, title, *args):
        self.run(title, 'sudo', 'env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get',
                 '-o', 'Dpkg::Use-Pty=0', '-o', 'DPkg::Lock::Timeout=120', '-o', 'Dpkg::Options::=--force-confdef',
                 '-o', 'Dpkg::Options::=--force-confold', *args)

    def owned(self, path, data, root=False, mode=0o644, allow_empty=False):
        if isinstance(data, str):
            data = data.encode()
        if path.is_symlink():
            raise Stop('Refusing to replace a symlink: ' + str(path))
        existing = path.read_bytes() if path.exists() else None
        records = self.state.setdefault('files', {})
        record = records.get(str(path))
        if not can_replace(existing, data, record, allow_empty):
            raise Stop('Existing file was not created here or has been edited; preserved: ' + str(path))
        if not record:
            if existing is not None:
                backup = self.directory / 'backups' / digest(str(path).encode())
                atomic(backup, existing)
            records[str(path)] = {'before': digest(existing) if existing is not None else None,
                                  'after': digest(data)}
        else:
            records[str(path)]['previous'] = digest(existing) if existing is not None else None
            records[str(path)]['after'] = digest(data)
        self.save()  # Journal the intended bytes before a possible interrupted write.
        if existing == data:
            return
        if root:
            with tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / 'file'
                source.write_bytes(data)
                self.run('Create ' + str(path.parent), 'sudo', 'install', '-d', '-m', '0755', str(path.parent))
                self.run('Write ' + str(path), 'sudo', 'install', '-m', f'{mode:04o}', str(source), str(path) + '.radar-tmp')
                self.run('Activate ' + str(path), 'sudo', 'mv', '-T', str(path) + '.radar-tmp', str(path))
        else:
            atomic(path, data, mode)

    def preflight(self):
        if os.geteuid() == 0:
            raise Stop('Run as the normal desktop user, without sudo.')
        if not re.fullmatch(r'/home/[a-zA-Z0-9_.-]+', str(self.home)):
            raise Stop('A standard /home/username desktop account is required.')
        supported_host(os_info(Path('/etc/os-release').read_text()), self.model,
                       self.capture('dpkg', '--print-architecture'), Path('/etc/rpi-issue').exists(),
                       bool(shutil.which('labwc')))
        if shutil.disk_usage(self.home).free < 4 * 1024**3:
            raise Stop('At least 4 GiB free space is required before installation.')
        if self.state:
            if self.state.get('schema') != 1 or self.state.get('uid') != os.getuid():
                raise Stop('Installer state belongs to a different account or schema.')
            if release_identity(self.state['release']) != release_identity(self.release):
                raise Stop('This installer snapshot targets a different app release. Existing version was preserved; app upgrades are manual.')
            if self.args.source_commit != self.state['installer_commit']:
                print('Using an explicitly refreshed installer; the application release stays pinned.')
                self.state['installer_commit'] = self.args.source_commit
                self.state['release'] = self.release
                self.save()
            return
        if self.args.check or self.args.reconfigure:
            raise Stop('No installation owned by this installer exists yet.')
        conflicts = [self.app, self.home / '.config/autostart/pi-rain-radar.desktop',
                     self.home / '.local/bin/pi-rain-radar-kiosk',
                     self.home / '.config/systemd/user/pi-rain-radar-kiosk.service',
                     Path('/etc/pi-rain-radar-power'), Path('/etc/pi-rain-radar-display')]
        if any(path.exists() or path.is_symlink() for path in conflicts) or shutil.which('docker'):
            raise Stop('An existing app/helper/Docker setup was found. Use the standard installation guide; no takeover was attempted.')
        print('\nPi Rain Radar installer ' + self.release['installer_version'])
        print(self.model + ' / Raspberry Pi OS 64-bit Desktop Trixie')
        print('This public test installer is awaiting fresh-hardware acceptance.')
        print('It rotates the display, fully upgrades this OS once, installs Docker/radar,')
        print('and configures desktop auto-login and a dedicated Chromium kiosk.')
        print('No maintenance schedules, broker/HA setup or SSH policy changes are added.')
        if not ask('Is this a freshly flashed, dedicated Pi, and shall installation continue?'):
            raise Stop('No installation changes made.')
        power = ask('Enable Device Power? Adds safe reboot/shutdown in the app; PIN remains optional.', True)
        mqtt = ask('Enable MQTT? Adds six display controls to your existing HA broker; blanking starts OFF.')
        self.state = {'schema': 1, 'uid': os.getuid(), 'installer_commit': self.args.source_commit,
                      'release': self.release, 'power': power, 'mqtt': mqtt, 'files': {}}
        self.save()

    def session(self):
        runtime = Path('/run/user') / str(os.getuid())
        sockets = [path for path in runtime.glob('wayland-*') if path.is_socket()]
        if len(sockets) != 1:
            raise Stop('Wait for the desktop to finish starting for this same user, then rerun. '
                       'If a login screen remains, log in there, or enable Desktop Autologin using sudo raspi-config and reboot.')
        self.env.update(XDG_RUNTIME_DIR=str(runtime), WAYLAND_DISPLAY=sockets[0].name,
                        DBUS_SESSION_BUS_ADDRESS='unix:path=' + str(runtime / 'bus'))

    def orientation(self):
        self.session()
        missing = [name for name in ('wlr-randr', 'kanshi') if not shutil.which(name)]
        if missing:
            self.apt('Refresh minimal display prerequisites', 'update')
            self.apt('Install minimal display prerequisites before orientation', 'install', '-y', *missing)
        display = select_display(outputs(self.capture('wlr-randr')), self.model)
        if display['mode'] == '1200x1920':
            print('10-inch Touch Display 2: best-effort, not physically tested.')
        saved = self.state.get('display', {})
        if (saved.get('output') == display['name'] and saved.get('transform') == display['transform']
                and saved.get('confirmed_boot') == self.boot):
            return
        print('\nScreen orientation comes first. Check the physical display and touch tracking.')
        if not self.state.get('display') and not ask('Is this an official 7-inch or 10-inch Touch Display 2?', True):
            raise Stop('Other displays are outside this installer.')
        chosen, original = None, display['transform']
        try:
            trials = list(dict.fromkeys([saved.get('transform', '90'), '90', '270']))
            for transform in trials:
                self.run('Try display rotation ' + transform, 'wlr-randr', '--output', display['name'], '--transform', transform)
                if ask('Is the picture upright, and does tapping a desktop control follow your finger?', True):
                    chosen = transform
                    break
            if chosen is None:
                raise Stop('Neither landscape rotation was confirmed. Original rotation restored; resolve the display before retrying.')
            text = MARKER + 'profile {\n    output ' + display['name'] + ' enable transform ' + chosen + '\n}\n'
            self.owned(self.home / '.config/kanshi/config', text, allow_empty=True)
            # Raspberry Pi OS already launches kanshi; only add startup if absent.
            if not self.capture('pgrep', '-u', str(os.getuid()), '-x', 'kanshi', required=False):
                self.owned(self.home / '.config/autostart/pi-rain-radar-kanshi.desktop',
                           '[Desktop Entry]\nType=Application\nName=Radar Display Orientation\nExec=/usr/bin/kanshi\nTerminal=false\n')
            self.state['display'] = {'output': display['name'], 'transform': chosen, 'mode': display['mode'],
                                     'confirmed_boot': self.boot}
            self.save()
        finally:
            if chosen is None:
                subprocess.run(['wlr-randr', '--output', display['name'], '--transform', original], env=self.env)

    def reboot(self, why):
        print('\n' + why)
        print('After the desktop returns, reconnect with your usual SSH command and run:\n' + RETRY)
        if ask('Reboot now?', True):
            self.run('Reboot requested; SSH will disconnect', 'sudo', 'systemctl', 'reboot')
        else:
            print('Reboot later with sudo reboot. Installation is paused at a saved checkpoint.')

    def upgrade(self):
        previous = self.state.get('upgrade_boot')
        if not previous:
            self.apt('Refresh OS packages (full initial upgrade is required)', 'update')
            self.apt('Install all initial OS updates', 'full-upgrade', '-y')
            audit = self.capture('dpkg', '--audit')
            if audit:
                raise Stop('dpkg reports unfinished package configuration. Resolve it before continuing:\n' + audit)
            self.state['upgrade_boot'] = self.boot
            self.save()
            previous = self.boot
        if previous == self.boot:
            self.reboot('Initial OS upgrade finished. Reboot before Docker/application setup.')
            return False
        return True

    def release_file(self, name):
        data = self.download('https://raw.githubusercontent.com/alex-soul/pi-rain-radar/' + self.release['app_commit'] + '/' + name)
        if digest(data) != self.release['files'][name]:
            raise Stop('Release file checksum mismatch: ' + name)
        return data

    def download(self, url):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'download'
            self.run('Download ' + url.rsplit('/', 1)[-1], 'curl', '-fsSL', '--retry', '3',
                     '--connect-timeout', '15', '--max-time', '120', url, '-o', str(target))
            return target.read_bytes()

    def desktop(self):
        self.apt('Install desktop/kiosk prerequisites', 'install', '-y', 'ca-certificates', 'curl',
                 'python3', 'util-linux', 'chromium', 'wlr-randr', 'kanshi')
        self.run('Enable desktop automatic login', 'sudo', 'raspi-config', 'nonint', 'do_boot_behaviour', 'B4')
        self.run('Disable OS blanking (optional controller owns idle policy)', 'sudo', 'raspi-config', 'nonint', 'do_blanking', '1')

    def docker(self):
        if not self.state.get('docker_ready'):
            key = self.download('https://download.docker.com/linux/debian/gpg')
            self.owned(Path('/etc/apt/keyrings/docker.asc'), key, root=True)
            self.owned(Path('/etc/apt/sources.list.d/docker.sources'), MARKER +
                       'Types: deb\nURIs: https://download.docker.com/linux/debian\nSuites: trixie\n'
                       'Components: stable\nArchitectures: arm64\nSigned-By: /etc/apt/keyrings/docker.asc\n', root=True)
            self.apt('Refresh Docker package index', 'update')
            self.apt('Install Docker Engine and Compose', 'install', '-y', 'docker-ce', 'docker-ce-cli',
                     'containerd.io', 'docker-buildx-plugin', 'docker-compose-plugin')
            self.run('Enable Docker', 'sudo', 'systemctl', 'enable', '--now', 'docker')
            self.run('Check Docker Engine', 'sudo', 'docker', 'info')
            self.run('Check Compose', 'sudo', 'docker', 'compose', 'version')
            self.state['docker_ready'] = True
            self.save()

    def compose(self, title, *args):
        self.run(title, 'sudo', 'docker', 'compose', '--project-directory', str(self.app), *args)

    def application(self):
        for name in ('compose.override.yaml', 'compose.override.yml', 'docker-compose.override.yaml', 'docker-compose.override.yml'):
            path = self.app / name
            if path.exists() or path.is_symlink():
                if not (name == 'compose.override.yaml' and self.state['power'] and path.is_symlink()
                        and os.readlink(path) == '/etc/pi-rain-radar-power/compose.power.yaml'):
                    raise Stop('Unexpected Compose override preserved: ' + str(path))
        self.owned(self.app / 'compose.yaml', self.release_file('compose.yaml'))
        version = self.release['app_release'] + '@' + self.release['app_digest']
        self.owned(self.app / '.env', 'RADAR_VERSION=' + version + '\n', mode=0o600)
        self.compose('Validate Compose', 'config', '-q')
        self.compose('Pull pinned published application ' + self.release['app_release'], 'pull')
        self.compose('Start Pi Rain Radar', 'up', '-d')
        self.health(wait=180)

    def power(self):
        if not self.state['power']:
            return
        if not self.state.get('power_ready'):
            bundle = self.directory / 'power-bundle'
            for name in ('manage.sh', 'helper.py', 'pi-rain-radar-power.service'):
                atomic(bundle / name, self.release_file('host/device-power/' + name), 0o644)
            self.run('Install optional restricted Device Power helper', 'sudo', 'sh', str(bundle / 'manage.sh'), 'install')
        self.run('Check Device Power token permissions', 'sudo', 'test', '-r', '/etc/pi-rain-radar-power/token')
        link = self.app / 'compose.override.yaml'
        target = '/etc/pi-rain-radar-power/compose.power.yaml'
        if link.is_symlink():
            if os.readlink(link) != target:
                raise Stop('Existing Compose override points elsewhere; preserved.')
        elif link.exists():
            raise Stop('Existing Compose override is not installer-owned; preserved.')
        else:
            link.symlink_to(target)
        self.compose('Validate Device Power wiring', 'config', '-q')
        self.compose('Enable Device Power in the app', 'up', '-d')
        self.state['power_ready'] = True
        self.save()

    def mqtt(self):
        if not self.state['mqtt']:
            return
        if self.state.get('mqtt_ready') and not self.args.reconfigure:
            return
        self.apt('Install optional MQTT display prerequisites', 'install', '-y', 'python3-paho-mqtt', 'swayidle', 'wlopm')
        try:
            self.run('Configure optional MQTT display controls', 'python3', str(SOURCE / 'host/display-controls/setup.py'),
                     '--output', self.state['display']['output'], interactive=True)
        except subprocess.CalledProcessError as error:
            if error.returncode == 2:
                if self.state.get('mqtt_ready'):
                    print('MQTT reconfiguration cancelled; existing setup retained.')
                    return
                if ask('Skip MQTT for now? It can be added later with --reconfigure.', True):
                    self.state['mqtt'] = False
                    self.save()
                    return
            raise
        # setup.py returns a distinct code on declined setup; failures never mark ready.
        self.state['mqtt_ready'] = True
        self.save()

    def kiosk(self):
        launcher = self.home / '.local/bin/pi-rain-radar-kiosk'
        self.owned(launcher, '''#!/bin/sh
set -eu
exec 9>"${XDG_RUNTIME_DIR:?}/pi-rain-radar-kiosk.lock"
flock -n 9 || exit 0
until curl -fsS --max-time 3 http://127.0.0.1:3080/healthz >/dev/null; do sleep 2; done
exec /usr/bin/chromium --user-data-dir="$HOME/.config/pi-rain-radar-chromium" --no-first-run --password-store=basic --noerrdialogs --kiosk 'http://127.0.0.1:3080/?kiosk=1'
''', mode=0o755)
        unit = self.home / '.config/systemd/user/pi-rain-radar-kiosk.service'
        self.owned(unit, f'''[Unit]
Description=Pi Rain Radar kiosk
StartLimitIntervalSec=0
[Service]
ExecStart={launcher}
Restart=always
RestartSec=5
''')
        start = self.home / '.local/bin/pi-rain-radar-start'
        self.owned(start, '''#!/bin/sh
set -eu
systemctl --user import-environment XDG_RUNTIME_DIR WAYLAND_DISPLAY
exec systemctl --user start pi-rain-radar-kiosk.service
''', mode=0o755)
        self.owned(self.home / '.config/autostart/pi-rain-radar.desktop',
                   f'[Desktop Entry]\nType=Application\nName=Pi Rain Radar\nExec={start}\nTerminal=false\n')
        self.run('Reload kiosk unit', 'systemctl', '--user', 'daemon-reload')
        self.run('Start kiosk in the desktop session', 'sh', str(start))

    def health(self, wait=15):
        deadline = time.monotonic() + wait
        while True:
            try:
                with urllib.request.urlopen('http://127.0.0.1:3080/healthz', timeout=4) as response:
                    result = json.load(response)
                if result.get('ok') is True:
                    print('Radar HTTP ready; imagery ' + ('available.' if result.get('hasFrame') else 'still acquiring.'))
                    return result
            except (OSError, ValueError):
                pass
            if time.monotonic() >= deadline:
                raise Stop('Radar health did not become ready. Inspect sudo docker compose logs in ' + str(self.app))
            time.sleep(3)

    def checks(self):
        self.session()
        display = select_display(outputs(self.capture('wlr-randr')), self.model)
        if display['transform'] != self.state['display']['transform']:
            raise Stop('Display rotation differs from the confirmed setting.')
        self.run('Check Docker service', 'sudo', 'systemctl', 'is-active', '--quiet', 'docker')
        self.health()
        self.run('Check kiosk service', 'systemctl', '--user', 'is-active', '--quiet', 'pi-rain-radar-kiosk.service')
        if self.state['power']:
            self.run('Check Device Power', 'sudo', 'systemctl', 'is-active', '--quiet', 'pi-rain-radar-power.service')
        if self.state.get('mqtt_ready'):
            self.run('Check MQTT adapter process', 'sudo', 'systemctl', 'is-active', '--quiet', 'pi-rain-radar-mqtt.service')
            self.run('Check local display controller', 'systemctl', '--user', 'is-active', '--quiet', 'pi-rain-radar-display.service')
        print('\nRecorded app: ' + self.release['app_release'] + ' (' + self.release['app_digest'] + ')')
        print('Kiosk: http://127.0.0.1:3080/?kiosk=1')
        print('Configure Map, optional providers and PIN from another device: http://' + socket.gethostname() + '.local:3080')
        print('Confirm picture, touch, kiosk startup after reboot and any selected HA controls yourself.')
        print('Process checks do not prove physical display or MQTT broker/discovery readiness.')
        print('App and OS updates are manual; no maintenance jobs were added.')

    def main(self):
        self.preflight()
        print('Log: ' + str(self.log))
        if self.args.check or (self.state.get('complete') and not self.args.reconfigure):
            self.checks()
            return
        if self.args.reconfigure and self.state.get('complete'):
            if not self.state['power']:
                self.state['power'] = ask('Add optional Device Power?', True)
            if not self.state['mqtt']:
                self.state['mqtt'] = ask('Add optional MQTT display controls?')
            self.save()
        self.orientation()
        if not self.upgrade():
            return
        if not self.state.get('desktop_ready'):
            self.desktop()
            self.state['desktop_ready'] = True
            self.save()
        self.docker()
        self.application()
        self.power()
        self.mqtt()
        self.kiosk()
        self.health(wait=60)
        # Allow services a short startup interval before bounded checks.
        time.sleep(3)
        self.checks()
        self.state['complete'] = True
        self.state['completed_boot'] = self.boot
        self.save()
        self.reboot('Installation steps completed. Reboot once to test automatic startup.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-commit', required=True)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--check', action='store_true')
    group.add_argument('--reconfigure', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.source_commit):
        raise SystemExit('A fixed installer source commit is required.')
    import fcntl
    lock_path = Path.home() / '.local/state/pi-rain-radar/install.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with lock_path.open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Another installer is running.') from None
        try:
            Installer(args).main()
        except (Stop, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
            print('\nInstallation stopped: ' + str(error), file=sys.stderr)
            print('No completion is claimed. Existing data and checkpoints are retained.', file=sys.stderr)
            raise SystemExit(1) from None
        except KeyboardInterrupt:
            raise SystemExit('\nInterrupted. Rerun the same command to resume; no app data was removed.') from None


if __name__ == '__main__':
    main()
