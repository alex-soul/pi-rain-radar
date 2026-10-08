"""Non-secret host configuration shared by the local controller and MQTT adapter."""
import json
import os
import re
from pathlib import Path

CONFIG_PATH = Path(os.environ.get('RADAR_DISPLAY_CONFIG', '/etc/pi-rain-radar-display/config.json'))


def validate(config, require_mqtt=False):
    for field in ('device_id', 'output'):
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', config[field]):
            raise ValueError(f'Invalid {field}')
    if not config['output'].startswith('DSI-'):
        raise ValueError('An official DSI display is required')
    if not re.fullmatch(r'/sys/class/backlight/[a-zA-Z0-9_@.:-]+', config['backlight']):
        raise ValueError('Invalid backlight')
    if not require_mqtt and not any(key in config for key in ('mqtt_host', 'mqtt_port', 'mqtt_tls')):
        return config
    if type(config['mqtt_tls']) is not bool:
        raise ValueError('TLS must be boolean')
    if type(config['mqtt_port']) is not int or not 1 <= config['mqtt_port'] <= 65535:
        raise ValueError('Invalid MQTT port')
    if not isinstance(config['mqtt_host'], str) or not config['mqtt_host'].strip():
        raise ValueError('MQTT host required')
    return config


def load(require_mqtt=False):
    return validate(json.loads(CONFIG_PATH.read_text()), require_mqtt=require_mqtt)


def events_address():
    return '\0pi-rain-radar-display-events-' + str(os.getuid())


def socket_path():
    return str(Path(os.environ.get('XDG_RUNTIME_DIR', f'/run/user/{os.getuid()}')) / 'pi-rain-radar-display.sock')
