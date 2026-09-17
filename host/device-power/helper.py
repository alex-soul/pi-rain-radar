#!/usr/bin/env python3
"""Restricted local power bridge. No TCP listener or caller-supplied command."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import socketserver
import sqlite3
import subprocess
import time
from http.server import BaseHTTPRequestHandler

VERSION = '1.0.0'


def power_action(action):
    subprocess.run(['/usr/bin/systemctl', '--no-block',
                    {'restart': 'reboot', 'shutdown': 'poweroff'}[action]],
                   check=True, timeout=8, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL)


class PowerService:
    def __init__(self, token, database, action=power_action, clock=time.time):
        if not re.fullmatch(r'[a-f0-9]{64}', token):
            raise ValueError('Invalid helper token')
        self.token, self.action, self.clock = token, action, clock
        self.db = sqlite3.connect(database)
        self.db.execute('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, time REAL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS power (singleton INTEGER PRIMARY KEY, time REAL)')
        self.db.commit()

    def pending(self):
        row = self.db.execute('SELECT time FROM power WHERE singleton=1').fetchone()
        return bool(row and self.clock() - row[0] < 120)

    def dispatch(self, method, path, headers, body):
        timestamp, request_id = headers.get('X-Power-Time', ''), headers.get('X-Power-Id', '')
        if (not re.fullmatch(r'\d{10}', timestamp) or
                abs(self.clock() - int(timestamp)) > 30 or
                not re.fullmatch(r'[a-f0-9-]{36}', request_id)):
            return 401, {}
        signed = '\n'.join([method, path, timestamp, request_id, body]).encode()
        expected = hmac.new(self.token.encode(), signed, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, headers.get('X-Power-Signature', '')):
            return 401, {}
        if (method, path) not in [('GET', '/status'), ('POST', '/power')]:
            return 404, {}
        if method == 'POST':
            try:
                value = json.loads(body)
                if not isinstance(value, dict) or set(value) != {'action'} or value['action'] not in ('restart', 'shutdown'):
                    return 400, {}
            except (ValueError, TypeError):
                return 400, {}
        with self.db:
            self.db.execute('DELETE FROM requests WHERE time < ?', (self.clock() - 300,))
            try:
                self.db.execute('INSERT INTO requests VALUES (?,?)', (request_id, self.clock()))
            except sqlite3.IntegrityError:
                return 409, {}
            if method == 'POST':
                if self.pending():
                    return 409, {}
                # Reserve durably before dispatch, including failed/uncertain calls.
                self.db.execute('INSERT OR REPLACE INTO power VALUES (1,?)', (self.clock(),))
        if method == 'GET':
            return 200, {'protocol': 1, 'version': VERSION, 'pending': self.pending()}
        try:
            self.action(value['action'])
        except (OSError, subprocess.SubprocessError):
            return 503, {}
        return 202, {'accepted': True}


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *args):
        pass  # No authentication headers or request payloads in logs.

    def handle_request(self):
        self.connection.settimeout(5)
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 0 or length > 256 or self.headers.get('Transfer-Encoding'):
                code, result = 413, {}
            else:
                body = self.rfile.read(length).decode('utf8')
                code, result = self.server.service.dispatch(self.command, self.path, self.headers, body)
        except (ValueError, UnicodeError):
            code, result = 400, {}
        except Exception:
            code, result = 503, {}
        data = json.dumps(result).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_GET = handle_request
    do_POST = handle_request


def main():
    token = Path('/etc/pi-rain-radar-power/token').read_text().strip()
    service = PowerService(token, '/var/lib/pi-rain-radar-power/requests.sqlite')
    socket = Path('/run/pi-rain-radar-power/control.sock')
    socket.unlink(missing_ok=True)
    with socketserver.UnixStreamServer(str(socket), Handler) as server:
        os.chmod(socket, 0o660)
        server.service = service
        server.serve_forever()


if __name__ == '__main__':
    main()
