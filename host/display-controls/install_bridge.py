#!/usr/bin/env python3
"""Install the local Screen bridge against an explicitly selected controller.

Does not install, replace or reconfigure the controller or its MQTT adapter.
"""
import argparse
import grp
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import stat
import subprocess
import tempfile

ETC = Path('/etc/pi-rain-radar-screen')
LIB = Path('/usr/local/lib/pi-rain-radar-screen')
SERVICE = 'pi-rain-radar-screen.service'


def definition(username, uid, controller, events):
    if not re.fullmatch(r'[a-z_][a-z0-9_-]*', username) or uid < 1:
        raise ValueError('Select a non-root desktop user')
    if not re.fullmatch(fr'/run/user/{uid}/[a-zA-Z0-9_.-]+\.sock', controller):
        raise ValueError('Controller must be in the desktop runtime directory')
    if events and not re.fullmatch(r'[a-zA-Z0-9_.-]{1,100}', events):
        raise ValueError('Invalid notification address')
    return {'controller_socket': controller, 'events_address': events}


def unit(username):
    return f'''[Unit]
Description=Pi Rain Radar Screen bridge
After=systemd-user-sessions.service
[Service]
User={username}
Group=radar-screen
LoadCredential=token:{ETC}/token
ExecStart=/usr/bin/python3 {LIB}/bridge.py
RuntimeDirectory=pi-rain-radar-screen
RuntimeDirectoryMode=0750
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
RestrictAddressFamilies=AF_UNIX
CapabilityBoundingSet=
UMask=0007
MemoryMax=48M
TasksMax=8
[Install]
WantedBy=multi-user.target
'''


def compose(gid):
    return f'''# Generated local Screen bridge; no broker or secret values.
services:
  radar:
    environment:
      SCREEN_HELPER_SOCKET: /run/radar-screen/control.sock
      SCREEN_HELPER_TOKEN_FILE: /run/secrets/radar-screen-token
    group_add:
      - "{gid}"
    volumes:
      - type: bind
        source: /run/pi-rain-radar-screen
        target: /run/radar-screen
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: /etc/pi-rain-radar-screen/token
        target: /run/secrets/radar-screen-token
        read_only: true
        bind:
          create_host_path: false
'''


def install(username, controller, events):
    account = pwd.getpwnam(username)
    settings = definition(username, account.pw_uid, controller, events)
    node = Path(controller).stat()
    if not stat.S_ISSOCK(node.st_mode) or node.st_uid != account.pw_uid:
        raise ValueError('Controller socket is not owned by the selected user')
    if os.geteuid() != 0 or not Path('/run/systemd/system').is_dir():
        raise ValueError('Run with sudo on the systemd host')
    # Existing installations must retain their controller selection and token.
    saved = ETC / 'config.json'
    if not saved.exists() and any(p.exists() for p in (ETC, LIB, Path('/etc/systemd/system') / SERVICE)):
        raise ValueError('Unmanaged bridge paths exist; preserve and review them first')
    if saved.exists() and json.loads(saved.read_text()) != settings:
        raise ValueError('Existing bridge targets another controller; preserve and review it first')
    for path in (ETC, LIB, ETC / 'token', saved):
        if path.is_symlink():
            raise ValueError('Refusing symlink installation target')
    try:
        group = grp.getgrnam('radar-screen')
    except KeyError:
        subprocess.run(['groupadd', '--system', 'radar-screen'], check=True)
        group = grp.getgrnam('radar-screen')
    for path in (ETC, LIB):
        path.mkdir(mode=0o755, parents=True, exist_ok=True)
    token = ETC / 'token'
    if not token.exists():
        with open(token, 'x', opener=lambda p, f: os.open(p, f, 0o600)) as stream:
            stream.write(secrets.token_hex(32) + '\n')
    if not re.fullmatch(r'[a-f0-9]{64}', token.read_text().strip()):
        raise ValueError('Invalid existing token; restore it before reinstalling')
    os.chown(token, 0, group.gr_gid)
    token.chmod(0o440)
    # Atomic replacements prevent partial source/config after interruption.
    files = {saved: json.dumps(settings) + '\n', ETC / 'compose.screen.yaml': compose(group.gr_gid),
             LIB / 'bridge.py': Path(__file__).with_name('bridge.py').read_text(),
             Path('/etc/systemd/system') / SERVICE: unit(username)}
    for target, content in files.items():
        with tempfile.NamedTemporaryFile(mode='w', dir=target.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o644)
        temporary.replace(target)
    for args in (['daemon-reload'], ['enable', '--now', SERVICE], ['restart', SERVICE], ['is-active', '--quiet', SERVICE]):
        subprocess.run(['systemctl', *args], check=True)
    print('Screen bridge installed. Add /etc/pi-rain-radar-screen/compose.screen.yaml to the app Compose files.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user', required=True)
    parser.add_argument('--controller-socket', required=True)
    parser.add_argument('--events-address', default='')
    args = parser.parse_args()
    install(args.user, args.controller_socket, args.events_address)
