#!/bin/sh
set -eu
# Run only inside test.Dockerfile: no host mounts, network, privileges or host PID.
[ "$(pwd)" = /work ] && [ -f /.dockerenv ] || exit 1
mkdir -p /run/systemd/system
# Replace systemctl inside this disposable image. Never call host power.
cat > /usr/bin/systemctl <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> /tmp/power-test-calls
exit 0
EOF
chmod 0755 /usr/bin/systemctl
sh host/device-power/manage.sh install
cp /etc/pi-rain-radar-power/token /tmp/original-token
sh host/device-power/manage.sh install
cmp /tmp/original-token /etc/pi-rain-radar-power/token
test "$(stat -c %a /etc/pi-rain-radar-power/token)" = 440
test "$(stat -c %U /usr/local/lib/pi-rain-radar-power/helper.py)" = root
systemd-analyze verify /etc/systemd/system/pi-rain-radar-power.service
python3 -m unittest discover -s host/device-power -p test_helper.py
mkdir -p /run/pi-rain-radar-power /var/lib/pi-rain-radar-power
chown root:radar-power /run/pi-rain-radar-power
chmod 0750 /run/pi-rain-radar-power
node host/device-power/socket-check.mjs
sh host/device-power/manage.sh remove
sh host/device-power/manage.sh remove
test ! -e /etc/systemd/system/pi-rain-radar-power.service
test ! -e /usr/local/lib/pi-rain-radar-power/helper.py
cmp /tmp/original-token /etc/pi-rain-radar-power/token
echo 'Installer, reinstall, removal and authenticated socket checks passed; power commands were mocked.'
