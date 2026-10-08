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
    parser.add_argument('--local-only', action='store_true', help='Set up local controls without adding MQTT')
    args = parser.parse_args()
    if os.geteuid() == 0:
        raise SystemExit('Run as the desktop user; sudo is used for host installation.')
    if not os.environ.get('WAYLAND_DISPLAY') or not os.environ.get('XDG_RUNTIME_DIR'):
        raise SystemExit('An active Wayland desktop environment is required.')
    for binary in ('wlopm', 'swayidle', 'systemctl', 'sudo'):
        if not shutil.which(binary):
            raise SystemExit(f'Missing {binary}; install the optional dependencies first.')
    if not args.local_only:
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
    print('Local Screen settings: brightness, sleep timer and idle timeout.')
    print('New installs leave automatic blanking OFF; touch resumes the screen.')
    settings.update(owner_uid=uid, device_id=settings.get('device_id', 'radar_' + uuid.uuid4().hex),
                    output=args.output, backlight=backlight)
    ca_source = None
    if not args.local_only:
        print('Use the address and MQTT login for your existing broker, such as the')
        print('Mosquitto broker in Home Assistant. This does not install a broker.')
        settings['mqtt_host'] = ask('MQTT broker address (hostname or IP)', settings.get('mqtt_host', ''))
        print('\nTLS encrypts the connection to your MQTT broker.')
        print('If you have not configured certificates/encryption on your broker, choose no.')
        print('Choose yes only if your broker already accepts TLS connections.')
        settings['mqtt_tls'] = yes('Does your broker use TLS encryption?', settings.get('mqtt_tls', False))
        default_port = settings.get('mqtt_port', 8883 if settings['mqtt_tls'] else 1883)
        settings['mqtt_port'] = int(ask('Broker port', str(default_port)))
        ca_source = None
        if settings['mqtt_tls']:
            print('For a certificate issued by a public authority, leave this empty.')
            print('For a private certificate authority, enter the path to its CA file on this Pi.')
            ca = ask('CA certificate file on the Pi (optional)', settings.get('mqtt_ca', ''))
            if ca:
                ca_source = Path(ca).expanduser().resolve(strict=True)
                settings['mqtt_ca'] = str(ETC / 'broker-ca.pem')
            else:
                settings['mqtt_ca'] = ''
        else:
            settings['mqtt_ca'] = ''
        config.validate(settings, require_mqtt=True)
        username_mqtt = ask('MQTT username')
        password = getpass.getpass('MQTT password (hidden): ')
        if not username_mqtt or not password:
            raise SystemExit('An authenticated broker account is required.')
        print('\nReady to connect to ' + settings['mqtt_host'] + ':' + str(settings['mqtt_port']))
        print('Connection: ' + ('TLS encrypted, broker certificate verified.' if settings['mqtt_tls']
                                else 'unencrypted MQTT on your LAN.'))
        print('Your MQTT login will be saved on this Pi, readable only by the administrator.')
        print('Next: test the login, then enable the six display controls in Home Assistant.')
        print('Existing Pi display settings will be updated if already configured.')
        print('Choose no to cancel this MQTT setup without changing its existing configuration.')
        if not yes('Connect and save these MQTT settings?', True):
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
    config.validate(settings)
    mqtt_enabled = bool(settings.get('mqtt_host'))
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
        if Path('/etc/systemd/system', MQTT_SERVICE).exists():
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
        if not args.local_only:
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
            if (staging / filename).exists():
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
    if mqtt_enabled:
        run('sudo', 'systemctl', 'enable', '--now', MQTT_SERVICE)
    time.sleep(2)
    run('systemctl', '--user', 'is-active', '--quiet', SERVICE)
    if mqtt_enabled:
        run('sudo', 'systemctl', 'is-active', '--quiet', MQTT_SERVICE)
    # A running transport is not proof of broker authentication/discovery.
    print('Local display controls started. Test brightness, idle timeout and touch wake.')
    if mqtt_enabled:
        print('Also check the six controls in Home Assistant and broker reconnect.')
    print('Reboot persistence and physical controls still require acceptance.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(f'Display setup stopped ({type(error).__name__}). No success is claimed; retry after resolving the failed step.') from None
