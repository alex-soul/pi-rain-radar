#!/bin/sh
set -eu
# Disposable container only. No privileged mode, host PID or writable host mounts.
[ -f /.dockerenv ] && [ "$(pwd)" = /work ] || exit 1
mkdir -p /run/systemd/system
cat > /usr/bin/systemctl <<'EOF'
#!/bin/sh
exit 0
EOF
chmod 755 /usr/bin/systemctl
useradd -m -u 1234 displaytest
mkdir -p /run/user/1234
chown displaytest /run/user/1234
runuser -u displaytest -- python3 -u -c '
import socket,json
s=socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM);s.bind("/run/user/1234/display.sock")
state=dict(ok=True,brightness=75,idle_timeout=15,automatic_blanking=False,persistence_ok=True,display_on=True)
while True:
 data,address=s.recvfrom(2048);command=json.loads(data)
 if command["action"]!="status":state[command["action"]]=command["value"]
 s.sendto(json.dumps(state).encode(),address)
' &
controller=$!
trap 'kill "$controller" ${bridge:-} 2>/dev/null || true' EXIT
for n in 1 2 3 4 5; do [ ! -S /run/user/1234/display.sock ] || break; sleep 1; done
python3 host/display-controls/install_bridge.py --user displaytest --controller-socket /run/user/1234/display.sock
cp /etc/pi-rain-radar-screen/token /tmp/screen-original
python3 host/display-controls/install_bridge.py --user displaytest --controller-socket /run/user/1234/display.sock
cmp /tmp/screen-original /etc/pi-rain-radar-screen/token
test "$(stat -c %a /etc/pi-rain-radar-screen/token)" = 440
systemd-analyze verify /etc/systemd/system/pi-rain-radar-screen.service
mkdir -p /run/pi-rain-radar-screen
chown displaytest:radar-screen /run/pi-rain-radar-screen
chmod 750 /run/pi-rain-radar-screen
# Emulate systemd credential handoff and group; no real service or host commands.
runuser -u displaytest -g radar-screen -- env CREDENTIALS_DIRECTORY=/etc/pi-rain-radar-screen python3 /usr/local/lib/pi-rain-radar-screen/bridge.py &
bridge=$!
for n in 1 2 3 4 5; do [ ! -S /run/pi-rain-radar-screen/control.sock ] || break; sleep 1; done
test "$(stat -c %a /run/pi-rain-radar-screen/control.sock)" = 660
# App user only gains the bridge group, never the desktop runtime socket.
runuser -u node -g radar-screen -- env SCREEN_HELPER_SOCKET=/run/pi-rain-radar-screen/control.sock SCREEN_HELPER_TOKEN_FILE=/etc/pi-rain-radar-screen/token node host/display-controls/socket-check.mjs
echo 'Bridge install/reinstall, unit, permissions and authenticated app socket passed (controller/systemctl mocked).'
