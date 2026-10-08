#!/usr/bin/env python3
"""Authenticated Unix HTTP bridge to the sole desktop display controller.

Runs as the desktop user, never root. The configured local controller retains
hardware, persistence, sleep/activity policy and MQTT ownership.
"""
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import socket
import socketserver
import time
import uuid
from http.server import BaseHTTPRequestHandler


def validate_command(value):
    if not isinstance(value, dict) or set(value) != {'action', 'value'}:
        raise ValueError('One setting required')
    action, v = value['action'], value['value']
    if action == 'automatic_blanking':
        if type(v) is not bool:
            raise ValueError('Boolean required')
    elif action in ('brightness', 'idle_timeout'):
        low, high = (10, 100) if action == 'brightness' else (1, 120)
        if type(v) not in (int, float) or not math.isfinite(v) or not low <= v <= high or (action == 'idle_timeout' and v != int(v)):
            raise ValueError('Invalid range')
    else:
        raise ValueError('Unsupported setting')
    return value


def controller_request(path, event_address, command):
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as channel:
        channel.bind('\0radar-screen-bridge-' + uuid.uuid4().hex)
        channel.settimeout(3)
        channel.connect(path)
        channel.send(json.dumps(command).encode())
        state = json.loads(channel.recv(2048))
    if not isinstance(state, dict) or state.get('ok') is not True:
        raise OSError('Controller unavailable')
    if command['action'] != 'status' and event_address:
        # A hint requests authoritative read-back, never an echoed command/state.
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as events:
                events.setblocking(False)
                events.sendto(b'changed', '\0' + event_address)
        except OSError:
            pass  # Broker/adapter absence cannot block local controls.
    return state


class ScreenService:
    def __init__(self, token, request, clock=time.time):
        if not re.fullmatch(r'[a-f0-9]{64}', token):
            raise ValueError('Invalid token')
        self.token, self.request, self.clock, self.seen = token, request, clock, {}

    def dispatch(self, method, path, headers, body):
        timestamp, request_id = headers.get('X-Power-Time', ''), headers.get('X-Power-Id', '')
        if not re.fullmatch(r'\d{10}', timestamp) or abs(self.clock()-int(timestamp)) > 30 or not re.fullmatch(r'[a-f0-9-]{36}', request_id):
            return 401, {}
        expected = hmac.new(self.token.encode(), '\n'.join([method,path,timestamp,request_id,body]).encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, headers.get('X-Power-Signature', '')):
            return 401, {}
        if path != '/screen' or method not in ('GET', 'POST'):
            return 404, {}
        try:
            command = validate_command(json.loads(body)) if method == 'POST' else {'action': 'status'}
        except (ValueError, TypeError):
            return 400, {}
        self.seen = {k:v for k,v in self.seen.items() if self.clock()-v <= 60}
        if request_id in self.seen or len(self.seen) >= 2048:
            return 409, {}
        self.seen[request_id] = self.clock()
        try:
            state = self.request(command)
            # Deliberately exclude Sleep/Wake and screen on/off state from this API.
            return 200, {'protocol': 1, 'brightness': state['brightness'],
                         'idle_timeout': state['idle_timeout'], 'automatic_blanking': state['automatic_blanking'],
                         'persistence_ok': state['persistence_ok'], 'persistence_pending': state.get('persistence_pending', False)}
        except (OSError, ValueError, KeyError, TypeError):
            return 503, {}


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *args):
        pass

    def handle_request(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 0 or size > 256 or self.headers.get('Transfer-Encoding'):
                code, data = 413, {}
            else:
                body = self.rfile.read(size).decode('utf8')
                code, data = self.server.service.dispatch(self.command, self.path, self.headers, body)
        except (ValueError, UnicodeError):
            code, data = 400, {}
        except Exception:
            code, data = 503, {}
        encoded = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    do_GET = handle_request
    do_POST = handle_request


def main():
    settings = json.loads(Path('/etc/pi-rain-radar-screen/config.json').read_text())
    path = settings['controller_socket']
    if not re.fullmatch(r'/run/user/\d+/[a-zA-Z0-9_.-]+\.sock', path):
        raise ValueError('Invalid controller socket')
    token = (Path(os.environ['CREDENTIALS_DIRECTORY']) / 'token').read_text().strip()
    service = ScreenService(token, lambda command: controller_request(path, settings.get('events_address'), command))
    target = Path('/run/pi-rain-radar-screen/control.sock')
    target.unlink(missing_ok=True)
    with socketserver.UnixStreamServer(str(target), Handler) as server:
        target.chmod(0o660)
        server.service = service
        server.serve_forever()


if __name__ == '__main__':
    main()
