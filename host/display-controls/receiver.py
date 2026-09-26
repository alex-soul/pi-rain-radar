"""Optional MQTT display controls with Home Assistant discovery."""
import json
import math
import os
import queue
import signal
import socket
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
import paho.mqtt.client as mqtt
import config as host_config

DEVICE_ID = 'pi_rain_radar_display'
BASE = ''
COMMANDS = {}

def configure(settings):
    global DEVICE_ID, BASE, COMMANDS
    DEVICE_ID = settings['device_id']
    BASE = 'pi-rain-radar/' + DEVICE_ID + '/display'
    COMMANDS = {BASE + '/' + suffix: action for suffix, action in (
        ('wake', 'wake'), ('sleep', 'sleep'), ('brightness/set', 'brightness'),
        ('automatic_blanking/set', 'automatic_blanking'), ('idle_timeout/set', 'idle_timeout'))}


def decode(topic, payload, retained, now=None):
    if topic not in COMMANDS or retained or len(payload) > 1024:
        raise ValueError('Invalid envelope')
    data = json.loads(payload)
    if not isinstance(data, dict) or type(data.get('schema')) is not int or data['schema'] != 1:
        raise ValueError('Invalid schema')
    if data.get('source') != 'home-assistant' or data.get('action') != COMMANDS[topic]:
        raise ValueError('Invalid action')
    sent = data.get('sent_at')
    if not isinstance(sent, str) or len(sent) > 64:
        raise ValueError('Invalid timestamp')
    age = ((now or datetime.now(timezone.utc)) - datetime.fromisoformat(sent)).total_seconds()
    if not -5 <= age <= 60:
        raise ValueError('Stale command')
    if data['action'] in ('brightness', 'idle_timeout'):
        value = data.get('value')
        low, high = (10, 100) if data['action'] == 'brightness' else (1, 120)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError('Invalid value')
        if data['action'] == 'idle_timeout' and value != int(value):
            raise ValueError('Whole minutes required')
    if data['action'] == 'automatic_blanking' and type(data.get('value')) is not bool:
        raise ValueError('Boolean required')
    return data

def discovery(prefix='homeassistant'):
    device = {'identifiers': [DEVICE_ID], 'name': 'Pi Rain Radar',
              'manufacturer': 'Alex Soul', 'model': 'Raspberry Pi Touch Display 2'}
    output = {}
    for key, name, low, high, unit, icon in [
        ('brightness', 'Screen brightness', 10, 100, '%', 'mdi:brightness-6'),
        ('idle_timeout', 'Idle timeout', 1, 120, 'min', 'mdi:timer-outline')]:
        template = '{"schema":1,"action":"' + key + '","source":"home-assistant","value":{{ value | float }},"sent_at":"{{ now().isoformat() }}"}'
        output[f'{prefix}/number/{DEVICE_ID}/{key}/config'] = {
            'name': name, 'unique_id': DEVICE_ID + '_' + key, 'device': device,
            'command_topic': f'{BASE}/{key}/set', 'state_topic': f'{BASE}/{key}/state',
            'command_template': template, 'min': low, 'max': high, 'step': 1,
            'mode': 'slider' if key == 'brightness' else 'box', 'unit_of_measurement': unit,
            'icon': icon, 'qos': 1, 'retain': False, 'optimistic': False,
            'availability_topic': BASE + '/availability'}
    output[f'{prefix}/button/{DEVICE_ID}/wake/config'] = {
        'name': 'Wake screen', 'unique_id': DEVICE_ID + '_wake', 'device': device,
        'command_topic': BASE + '/wake', 'qos': 1, 'retain': False,
        'command_template': '{"schema":1,"action":"wake","source":"home-assistant","sent_at":"{{ now().isoformat() }}"}',
        'icon': 'mdi:monitor', 'availability_topic': BASE + '/availability'}
    output[f'{prefix}/binary_sensor/{DEVICE_ID}/screen_on/config'] = {
        'name': 'Screen state', 'unique_id': DEVICE_ID + '_screen_on', 'device': device,
        'state_topic': BASE + '/screen_on/state', 'payload_on': 'ON', 'payload_off': 'OFF',
        'icon': 'mdi:monitor', 'qos': 1, 'availability_topic': BASE + '/availability'}
    output[f'{prefix}/button/{DEVICE_ID}/sleep/config'] = {
        'name': 'Sleep screen', 'unique_id': DEVICE_ID + '_sleep', 'device': device,
        'command_topic': BASE + '/sleep', 'qos': 1, 'retain': False,
        'command_template': '{"schema":1,"action":"sleep","source":"home-assistant","sent_at":"{{ now().isoformat() }}"}',
        'icon': 'mdi:monitor-off', 'availability_topic': BASE + '/availability'}
    output[f'{prefix}/switch/{DEVICE_ID}/automatic_blanking/config'] = {
        'name': 'Automatic screen blanking', 'unique_id': DEVICE_ID + '_automatic_blanking',
        'device': device, 'command_topic': BASE + '/automatic_blanking/set',
        'state_topic': BASE + '/automatic_blanking/state', 'payload_on': 'ON', 'payload_off': 'OFF',
        'command_template': '{"schema":1,"action":"automatic_blanking","source":"home-assistant","value":{{ "true" if value == "ON" else "false" }},"sent_at":"{{ now().isoformat() }}"}',
        'qos': 1, 'retain': False, 'optimistic': False, 'icon': 'mdi:monitor-off',
        'availability_topic': BASE + '/availability'}
    return output

def state_values(state):
    if type(state['display_on']) is not bool or type(state['automatic_blanking']) is not bool:
        raise ValueError('Display power state unavailable')
    return (state['brightness'], state['idle_timeout'], 'ON' if state['display_on'] else 'OFF',
            'ON' if state['automatic_blanking'] else 'OFF')

def request(data):
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as channel:
        channel.bind('\0pi-rain-radar-mqtt-' + uuid.uuid4().hex)
        channel.settimeout(3)
        channel.sendto(json.dumps(data).encode(), host_config.socket_path())
        result = json.loads(channel.recv(2048))
        if not result.get('ok'):
            raise OSError('Controller rejected request')
        return result

def main():
    settings = host_config.load()
    configure(settings)
    running, ready = True, False
    last_state, last_error = None, None
    next_status = 0
    seen, subscriptions = {}, set()
    events = queue.Queue(maxsize=128)
    birth = os.environ.get('HA_BIRTH_TOPIC', 'homeassistant/status')
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=DEVICE_ID + '-display')
    cred = json.loads((Path(os.environ['CREDENTIALS_DIRECTORY']) / 'mqtt.json').read_text())
    client.username_pw_set(cred['username'], cred['password'])
    if settings['mqtt_tls']:
        client.tls_set(ca_certs=settings.get('mqtt_ca') or None)
    client.will_set(BASE + '/availability', 'offline', qos=1, retain=True)

    def log(event, **fields):
        print(json.dumps({'event': event, **fields}), flush=True)

    def publish_state(state, force=False):
        nonlocal last_state, last_error
        if not state['persistence_ok']:
            raise OSError('Persistence unavailable')
        values = state_values(state)
        if force or values != last_state:
            for name, value in zip(('brightness', 'idle_timeout', 'screen_on', 'automatic_blanking'), values):
                client.publish(f'{BASE}/{name}/state', str(value), qos=1, retain=True)
            last_state = values
        client.publish(BASE + '/availability', 'online', qos=1, retain=True)
        last_error = None

    def unavailable():
        nonlocal last_error
        client.publish(BASE + '/availability', 'offline', qos=1, retain=True)
        if last_error != 'unavailable':
            log('display-controls-unavailable')
        last_error = 'unavailable'

    def enqueue(kind, data=None):
        try:
            events.put_nowait((kind, data))
        except queue.Full:
            # No queued command is executed beyond its freshness window.
            pass

    def stop(signum, frame):
        nonlocal running
        running = False

    client.on_connect = lambda c,u,f,r,p: enqueue('connect', not r.is_failure)
    client.on_disconnect = lambda c,u,f,r,p: enqueue('disconnect')
    client.on_subscribe = lambda c,u,mid,codes,p: enqueue('subscribed', (mid, not any(x.is_failure for x in codes)))
    client.on_message = lambda c,u,m: enqueue('message', (m.topic, m.payload, m.retain)) if len(m.payload) <= 1024 else None
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    client.reconnect_delay_set(min_delay=2, max_delay=60)
    client.connect_async(settings['mqtt_host'], settings['mqtt_port'], 60)
    # Abstract socket works within ProtectSystem=strict without writable paths.
    # Hints only trigger authoritative read-back; they never carry state/commands.
    notifications = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    notifications.bind(host_config.events_address())
    notifications.setblocking(False)
    client.loop_start()
    try:
        while running:
            try:
                notifications.recv(64)
                next_status = 0
            except BlockingIOError:
                pass
            try:
                kind, item = events.get(timeout=0.5)
            except queue.Empty:
                kind, item = None, None
            if kind == 'connect':
                ready = False
                subscriptions.clear()
                if item:
                    client.publish(BASE + '/availability', 'offline', qos=1, retain=True)
                    for topic in list(COMMANDS) + [birth]:
                        rc, mid = client.subscribe(topic, qos=1)
                        if rc != mqtt.MQTT_ERR_SUCCESS:
                            raise RuntimeError('Subscription failed')
                        subscriptions.add(mid)
                else:
                    log('mqtt-connection-rejected')
            elif kind == 'disconnect':
                ready = False
            elif kind == 'subscribed':
                mid, success = item
                if not success:
                    raise RuntimeError('Subscription denied')
                subscriptions.discard(mid)
                if not subscriptions:
                    ready = True
                    enqueue('discovery')
            elif kind == 'discovery' and ready:
                for topic, config in discovery(os.environ.get('MQTT_DISCOVERY_PREFIX', 'homeassistant')).items():
                    client.publish(topic, json.dumps(config), qos=1, retain=True)
                log('discovery-published', entities=6)
                last_state, next_status = None, 0
            elif kind == 'message' and ready:
                topic, payload, retained = item
                if topic == birth:
                    if payload == b'online':
                        enqueue('discovery')
                else:
                    try:
                        data = decode(topic, payload, retained)
                        key, now = (data['action'], data['sent_at']), time.monotonic()
                        seen = {key: value for key, value in seen.items() if now - value <= 65}
                        if key not in seen:
                            publish_state(request(data))
                            seen[key] = now
                            if len(seen) > 256:
                                del seen[next(iter(seen))]
                            log('mqtt-command-applied', action=data['action'], sent_at=data['sent_at'])
                            next_status = now + 2  # Include delayed persistence result.
                    except (ValueError, TypeError, UnicodeError, KeyError):
                        log('mqtt-command-rejected')
                    except OSError:
                        unavailable()
            if ready and client.is_connected() and time.monotonic() >= next_status:
                try:
                    publish_state(request({'action': 'status'}), force=last_state is None)
                except (OSError, ValueError, KeyError):
                    unavailable()
                next_status = time.monotonic() + 30
    finally:
        notifications.close()
        if client.is_connected():
            client.publish(BASE + '/availability', 'offline', qos=1, retain=True).wait_for_publish(timeout=2)
        client.disconnect()
        client.loop_stop()

if __name__ == '__main__':
    main()
