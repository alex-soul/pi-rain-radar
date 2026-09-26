"""Local display policy, brightness and persistent timeout; no remote shell."""
import json
import math
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import config

# Populated from detected, validated installation settings by main().
BACKLIGHT = None
OUTPUT = None

def display_state():
    result = subprocess.run(['/usr/bin/wlopm'], check=True, timeout=2,
                            capture_output=True, text=True)
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) == 2 and fields[0] == OUTPUT and fields[1] in ('on', 'off'):
            return fields[1] == 'on'
    raise OSError('Display power state unavailable')

def notify_display():
    # A best-effort hint only: local touch/power must never depend on MQTT.
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as channel:
            channel.setblocking(False)
            channel.sendto(b'changed', config.events_address())
    except OSError:
        pass

def number(value, low, high, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('Number required')
    if not math.isfinite(value) or not low <= value <= high or (integer and value != int(value)):
        raise ValueError('Invalid range or precision')
    return value

def raw_brightness(value, maximum):
    return max(1, math.floor(number(value, 10, 100) * maximum / 100 + 0.5))

def boolean(value):
    if type(value) is not bool:
        raise ValueError('Boolean required')
    return value

class Policy:
    def __init__(self, seconds, now, automatic_blanking=False):
        self.seconds, self.last_activity = seconds, now
        self.idle, self.last_wake = False, None
        self.automatic_blanking = boolean(automatic_blanking)
        self.explicit_sleep = False

    def set_blanking(self, enabled, now):
        enabled = boolean(enabled)
        if enabled != self.automatic_blanking:
            self.automatic_blanking = enabled
            # Start a full idle interval when re-enabling, without undoing Sleep.
            self.last_activity, self.last_wake = now, None

    def event(self, action, now):
        if action == 'idle' and not self.idle:
            self.idle, self.last_activity = True, now - 1
        elif action == 'activity':
            self.idle, self.last_activity = False, now
            self.explicit_sleep = False
        elif action == 'wake':
            self.last_wake = now
            self.explicit_sleep = False
        elif action == 'sleep':
            self.idle, self.last_activity, self.last_wake = True, float('-inf'), None
            self.explicit_sleep = True

    def awake(self, now):
        if self.explicit_sleep:
            return False
        if not self.automatic_blanking:
            return True
        return (not self.idle or now - self.last_activity < self.seconds or
                (self.last_wake is not None and now - self.last_wake < self.seconds))

def main():
    global BACKLIGHT, OUTPUT
    settings = config.load()
    BACKLIGHT, OUTPUT = Path(settings['backlight']), settings['output']
    path = config.socket_path()
    if len(sys.argv) == 2:
        with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as channel:
            channel.sendto(sys.argv[1].encode(), path)
        return
    saved = Path.home() / '.local/state/pi-rain-radar-display/settings.json'
    maximum = int((BACKLIGHT / 'max_brightness').read_text())
    brightness = int((BACKLIGHT / 'brightness').read_text())
    minutes, automatic_blanking = 15, False
    if saved.exists():
        try:
            data = json.loads(saved.read_text())
            restored_minutes = int(number(data['idle_minutes'], 1, 120, True))
            restored_raw = int(number(data['brightness_raw'], 1, maximum, True))
            restored_blanking = boolean(data.get('automatic_blanking', False))
            (BACKLIGHT / 'brightness').write_text(str(restored_raw))
            brightness, minutes = restored_raw, restored_minutes
            automatic_blanking = restored_blanking
        except (OSError, ValueError, KeyError, TypeError):
            print('Saved settings unavailable; using hardware brightness and 15 minutes', flush=True)
    policy = Policy(minutes * 60, time.monotonic(), automatic_blanking)
    running, display = True, None
    dirty_at, persistence_ok, retry_at = time.monotonic() + 1, True, 0

    def log(event, **fields):
        print(json.dumps({'event': event, **fields}), flush=True)

    def power(on):
        nonlocal display
        if display != on:
            subprocess.run(['/usr/bin/wlopm', '--on' if on else '--off', OUTPUT], check=True, timeout=5)
            display = on
            log('display-on' if on else 'display-off')
            notify_display()

    def persist():
        nonlocal dirty_at, persistence_ok, retry_at
        try:
            saved.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            temporary = saved.with_suffix('.tmp')
            with temporary.open('w') as handle:
                json.dump({'brightness_raw': brightness, 'idle_minutes': policy.seconds // 60,
                           'automatic_blanking': policy.automatic_blanking}, handle)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.chmod(0o600)
            temporary.replace(saved)
            dirty_at, persistence_ok = None, True
        except OSError:
            if persistence_ok:
                log('settings-persistence-failed')
            persistence_ok, retry_at = False, time.monotonic() + 30

    def status():
        actual = int((BACKLIGHT / 'brightness').read_text())
        return {'ok': True, 'brightness': round(actual * 100 / maximum),
                'brightness_raw': actual, 'idle_timeout': policy.seconds // 60,
                'automatic_blanking': policy.automatic_blanking,
                'display_on': display_state(), 'persistence_ok': persistence_ok}

    def stop(signum, frame):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    Path(path).unlink(missing_ok=True)
    server = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    server.bind(path)
    os.chmod(path, 0o600)
    server.settimeout(0.5)
    child = None
    try:
        power(True)
        helper = '/usr/bin/python3 ' + str(Path(__file__).resolve())
        child = subprocess.Popen(['/usr/bin/swayidle', '-w', 'timeout', '1', helper + ' idle', 'resume', helper + ' activity'])
        log('controller-ready', idle_minutes=minutes, brightness_raw=brightness)
        while running:
            if child.poll() is not None:
                raise RuntimeError('Idle watcher exited')
            try:
                payload, address = server.recvfrom(2048)
            except socket.timeout:
                payload, address = None, None
            if payload:
                try:
                    text = payload.decode('utf-8')
                    req = json.loads(text) if text.startswith('{') else {'action': text}
                    if not isinstance(req, dict):
                        raise ValueError('Object required')
                    action, now = req.get('action'), time.monotonic()
                    if action in ('idle', 'activity', 'wake', 'sleep'):
                        policy.event(action, now)
                        if action == 'wake':
                            log('mqtt-wake', hold_seconds=policy.seconds)
                        elif action == 'sleep':
                            log('mqtt-sleep')
                    elif action == 'brightness':
                        (BACKLIGHT / 'brightness').write_text(str(raw_brightness(req.get('value'), maximum)))
                        brightness = int((BACKLIGHT / 'brightness').read_text())
                        dirty_at = now + 1
                        log('brightness-changed', raw=brightness)
                    elif action == 'idle_timeout':
                        policy.seconds = int(number(req.get('value'), 1, 120, True)) * 60
                        dirty_at = now + 1
                        log('idle-timeout-changed', minutes=policy.seconds // 60)
                    elif action == 'automatic_blanking':
                        policy.set_blanking(req.get('value'), now)
                        dirty_at = now + 1
                        log('automatic-blanking-changed', enabled=policy.automatic_blanking)
                    elif action != 'status':
                        raise ValueError('Unknown action')
                    power(policy.awake(now))
                    reply = status() if address else None
                except (ValueError, TypeError, UnicodeError, OSError, subprocess.SubprocessError):
                    reply = {'ok': False, 'error': 'Display request rejected or failed'}
                    log('display-request-failed')
                if address:
                    try:
                        server.sendto(json.dumps(reply).encode(), address)
                    except OSError:
                        pass
            power(policy.awake(time.monotonic()))
            if dirty_at is not None and time.monotonic() >= max(dirty_at, retry_at):
                persist()
    finally:
        if child is not None and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        if dirty_at is not None:
            persist()
        server.close()
        Path(path).unlink(missing_ok=True)
        power(True)

if __name__ == '__main__':
    main()
