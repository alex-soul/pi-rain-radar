#!/usr/bin/env python3
"""Interactive optional display-controls setup, run as the desktop user.

Development installer component. No broker/HA administration or maintenance.
"""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

import config

LIBRARY = Path('/usr/local/lib/pi-rain-radar-display')
ETC = Path('/etc/pi-rain-radar-display')
SERVICE = 'pi-rain-radar-display.service'
MQTT_SERVICE = 'pi-rain-radar-mqtt.service'


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def ask(prompt, default=''):
    answer = input(f'{prompt}' + (f' [{default}]' if default else '') + ': ').strip()
    return answer or default


def yes(prompt, default=False):
    while True:
        answer = ask(prompt, 'yes' if default else 'no').lower()
        if answer in ('yes', 'y', 'no', 'n'):
            return answer in ('yes', 'y')


def atomic(path, text, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('w') as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.chmod(mode)
    temporary.replace(path)


def user_unit(output):
    return f'''[Unit]
Description=Pi Rain Radar local display controls
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
ExecStartPre=/usr/bin/wlopm --on {output}
ExecStart=/usr/bin/python3 {LIBRARY}/controller.py
ExecStopPost=-/usr/bin/wlopm --on {output}
Restart=on-failure
RestartSec=5
TimeoutStopSec=10
UMask=0077
'''


def mqtt_unit(username, uid):
    if not re.fullmatch(r'[a-z_][a-z0-9_-]*', username) or type(uid) is not int or uid < 1:
        raise ValueError('Unsupported desktop account')
    return f'''[Unit]
Description=Pi Rain Radar optional MQTT display adapter
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
Type=simple
User={username}
Environment=XDG_RUNTIME_DIR=/run/user/{uid}
LoadCredential=mqtt.json:{ETC}/mqtt.json
ExecStart=/usr/bin/python3 {LIBRARY}/receiver.py
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
UMask=0077

[Install]
WantedBy=multi-user.target
'''


def backlight_rule(backlight, gid):
    name = Path(backlight).name
    if not re.fullmatch(r'[a-zA-Z0-9_@.:-]+', name) or type(gid) is not int or gid < 1:
        raise ValueError('Invalid backlight permission target')
    return (f'ACTION=="add", SUBSYSTEM=="backlight", KERNEL=="{name}", '
            f'RUN+="/bin/chgrp {gid} /sys%p/brightness", '
            'RUN+="/bin/chmod 0660 /sys%p/brightness"\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if os.geteuid() == 0:
        raise SystemExit('Run as the desktop user; sudo is used for host installation.')
    if not os.environ.get('WAYLAND_DISPLAY') or not os.environ.get('XDG_RUNTIME_DIR'):
        raise SystemExit('An active Wayland desktop environment is required.')
    for binary in ('wlopm', 'swayidle', 'systemctl', 'sudo'):
        if not shutil.which(binary):
            raise SystemExit(f'Missing {binary}; install the optional dependencies first.')
    # Dependency check before changing the host.
    import paho.mqtt.client as mqtt
    if not hasattr(mqtt, 'CallbackAPIVersion'):
        raise SystemExit('python3-paho-mqtt 2.x is required.')
    run('wlopm', capture_output=True, text=True)
    uid, gid, username = os.getuid(), os.getgid(), getpass.getuser()
    mqtt_unit(username, uid)  # Validate before any changes.
    settings = config.load() if config.CONFIG_PATH.exists() else {}
    if settings and settings.get('owner_uid') != uid:
        raise SystemExit('The existing display installation belongs to another user.')
    backlights = sorted(Path('/sys/class/backlight').glob('*/brightness'))
    if len(backlights) != 1:
        raise SystemExit('Expected exactly one display backlight. Resolve the hardware setup first.')
    backlight = str(backlights[0].parent)
    print('MQTT adds six Home Assistant controls: brightness, idle timeout, screen state,')
    print('Wake, Sleep and Automatic screen blanking. New installs leave blanking OFF.')
    print('Turning it ON uses the saved timeout (initially 15 minutes). Sleep still works')
    print('when it is OFF; touch or Wake resumes. No HA automations are created.')
    settings.update(owner_uid=uid, device_id=settings.get('device_id', 'radar_' + uuid.uuid4().hex),
                    output=args.output, backlight=backlight)
    settings['mqtt_host'] = ask('Existing broker hostname or IP', settings.get('mqtt_host', ''))
    print('TLS needs a broker already configured for TLS. Choose No for a normal LAN')
    print('broker on port 1883. No certificates or broker settings will be created.')
    settings['mqtt_tls'] = yes('Use TLS?', settings.get('mqtt_tls', False))
    default_port = settings.get('mqtt_port', 8883 if settings['mqtt_tls'] else 1883)
    settings['mqtt_port'] = int(ask('Broker port', str(default_port)))
    ca_source = None
    if settings['mqtt_tls']:
        ca = ask('Private CA file, or leave empty for system trust', settings.get('mqtt_ca', ''))
        if ca:
            ca_source = Path(ca).expanduser().resolve(strict=True)
            settings['mqtt_ca'] = str(ETC / 'broker-ca.pem')
        else:
            settings['mqtt_ca'] = ''
    else:
        settings['mqtt_ca'] = ''
    config.validate(settings)
    username_mqtt = ask('MQTT username')
    password = getpass.getpass('MQTT password (hidden): ')
    if not username_mqtt or not password:
        raise SystemExit('An authenticated broker account is required.')
    print('Credentials will be stored root-only and supplied using systemd credentials.')
    print('Plain MQTT is unencrypted on your LAN. TLS, if selected, verifies the broker certificate.')
    if not yes('Install/update these optional display controls?', True):
        raise SystemExit(2)
    # Validate authentication and TLS before stopping any existing controller.
    # This probe neither publishes discovery nor operates the display.
    connected = threading.Event()
    accepted = []
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='radar-setup-' + uuid.uuid4().hex)
    client.username_pw_set(username_mqtt, password)
    if settings['mqtt_tls']:
        client.tls_set(ca_certs=str(ca_source) if ca_source else None)
    def on_connect(client, userdata, flags, reason, properties):
        accepted.append(not reason.is_failure)
        connected.set()
    client.on_connect = on_connect
    client.connect_async(settings['mqtt_host'], settings['mqtt_port'], 30)
    client.loop_start()
    try:
        if not connected.wait(20) or not accepted[0]:
            raise SystemExit('Broker authentication/TLS connection did not succeed. No display services were changed; check broker details and retry.')
    finally:
        client.disconnect()
        client.loop_stop()
    run('sudo', '-v')
    source = Path(__file__).resolve().parent
    # Capture pre-change hardware permission state once for documented recovery.
    if 'backlight_original_gid' not in settings:
        stat = backlights[0].stat()
        settings['backlight_original_gid'] = stat.st_gid
        settings['backlight_original_mode'] = stat.st_mode & 0o777
    user_service = Path.home() / '.config/systemd/user' / SERVICE
    autostart = Path.home() / '.config/autostart/pi-rain-radar-display.desktop'
    if not config.CONFIG_PATH.exists():
        for target in (LIBRARY, ETC, Path('/etc/systemd/system') / MQTT_SERVICE,
                       Path('/etc/udev/rules.d/90-pi-rain-radar-display.rules'), user_service, autostart):
            if target.exists():
                raise SystemExit(f'Unmanaged existing path: {target}. Resolve manually before setup.')
    # Setup is serialized by the calling installer; stop writers before replacing code.
    if config.CONFIG_PATH.exists():
        run('sudo', 'systemctl', 'stop', MQTT_SERVICE)
        run('systemctl', '--user', 'stop', SERVICE)
        backup = Path('/var/lib/pi-rain-radar-display-backups') / str(time.time_ns())
        run('sudo', 'install', '-d', '-m', '0700', str(backup))
        for path in (ETC, LIBRARY, Path('/etc/systemd/system') / MQTT_SERVICE,
                     Path('/etc/udev/rules.d/90-pi-rain-radar-display.rules')):
            if path.exists():
                run('sudo', 'cp', '-a', str(path), str(backup / path.name))
        for path in (user_service, autostart):
            if path.exists():
                run('sudo', 'cp', '-a', str(path), str(backup / path.name))
        print(f'Previous files backed up root-only at {backup}. Settings are preserved.')
    with tempfile.TemporaryDirectory(prefix='radar-display-') as folder:
        staging = Path(folder)
        staging.chmod(0o700)
        atomic(staging / 'config.json', json.dumps(settings) + '\n')
        atomic(staging / 'mqtt.json', json.dumps({'username': username_mqtt, 'password': password}), 0o600)
        atomic(staging / MQTT_SERVICE, mqtt_unit(username, uid))
        atomic(staging / '90-pi-rain-radar-display.rules', backlight_rule(backlight, gid))
        run('sudo', 'install', '-d', '-m', '0755', str(ETC), str(LIBRARY))
        for filename in ('controller.py', 'receiver.py', 'config.py', 'start.sh'):
            run('sudo', 'install', '-m', '0755' if filename.endswith('.sh') else '0644',
                str(source / filename), str(LIBRARY / filename))
        if ca_source:
            run('sudo', 'install', '-m', '0644', str(ca_source), str(ETC / 'broker-ca.pem'))
        for filename, target, mode in (
            ('config.json', ETC / 'config.json', '0644'),
            ('mqtt.json', ETC / 'mqtt.json', '0600'),
            (MQTT_SERVICE, Path('/etc/systemd/system') / MQTT_SERVICE, '0644'),
            ('90-pi-rain-radar-display.rules', Path('/etc/udev/rules.d/90-pi-rain-radar-display.rules'), '0644')):
            run('sudo', 'install', '-m', mode, str(staging / filename), str(target))
    run('sudo', 'chgrp', str(gid), str(backlights[0]))
    run('sudo', 'chmod', '0660', str(backlights[0]))
    run('sudo', 'udevadm', 'control', '--reload-rules')
    atomic(user_service, user_unit(args.output))
    atomic(autostart, f'''[Desktop Entry]
Type=Application
Name=Pi Rain Radar Display Controls
Exec={LIBRARY}/start.sh
Terminal=false
X-Pi-Rain-Radar-Managed=true
''')
    run('systemctl', '--user', 'daemon-reload')
    run('sh', str(LIBRARY / 'start.sh'))
    run('sudo', 'systemctl', 'daemon-reload')
    run('sudo', 'systemctl', 'enable', '--now', MQTT_SERVICE)
    time.sleep(2)
    run('systemctl', '--user', 'is-active', '--quiet', SERVICE)
    run('sudo', 'systemctl', 'is-active', '--quiet', MQTT_SERVICE)
    # A running transport is not proof of broker authentication/discovery.
    print('Local services started. Check the six controls in Home Assistant and test touch.')
    print('If absent, inspect: sudo journalctl -u pi-rain-radar-mqtt -n 30 --no-pager')
    print('Reboot persistence, broker reconnect and physical controls still require acceptance.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(f'Display setup stopped ({type(error).__name__}). No success is claimed; retry after resolving the failed step.') from None
